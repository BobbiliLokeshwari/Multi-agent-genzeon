import json
import os
import re
import yaml
from datetime import datetime
from string import Template
from typing import Dict, List, Optional, TypedDict
from dotenv import load_dotenv
from openai import OpenAI
from langgraph.graph import StateGraph, END
from tavily import TavilyClient

load_dotenv()

_BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PROMPT_VERSION = os.getenv("PROMPT_VERSION", "v1")
MEMORY_FILE = os.path.join(_BASE_DIR, "memory", "posts_history.json")

# Gemini powers every agent in the pipeline (research / writer / validator) and
# the independent judge. Both read GEMINI_API_KEY from .env.
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-flash-latest")


def _parse_json_object(raw: Optional[str]):
    if not raw or not raw.strip():
        raise ValueError("empty LLM response")
    fenced = re.search(r"```[a-zA-Z]*\s*(.*?)\s*```", raw, re.DOTALL)
    candidate = fenced.group(1) if fenced else raw.strip()
    try:
        data = json.loads(candidate)
    except json.JSONDecodeError:
        # Models sometimes wrap the JSON in prose or leave a fence unclosed.
        start, end = candidate.find("{"), candidate.rfind("}")
        if start == -1 or end <= start:
            raise
        data = json.loads(candidate[start:end + 1])
    if not isinstance(data, dict):
        raise ValueError(f"expected a JSON object, got {type(data).__name__}")
    return data


class PromptLoader:
    def __init__(self, version: str = PROMPT_VERSION):
        self.dir = os.path.join(_BASE_DIR, "prompts", version)

    def load_agent(self, name: str) -> dict:
        with open(os.path.join(self.dir, f"{name}_agent.yaml")) as f:
            return yaml.safe_load(f)

    def load_task(self, name: str) -> Template:
        with open(os.path.join(self.dir, f"{name}_task.md")) as f:
            return Template(f.read())

    def load_prompt(self, name: str) -> Template:
        with open(os.path.join(self.dir, f"{name}_prompt.md")) as f:
            return Template(f.read())


class MemoryManager:
    def __init__(self, memory_file: str = MEMORY_FILE):
        self.memory_file = memory_file
        os.makedirs(os.path.dirname(memory_file), exist_ok=True)
        self.history: List[dict] = self._load()

    def _load(self) -> List[dict]:
        if not os.path.exists(self.memory_file):
            return []
        try:
            with open(self.memory_file) as f:
                data = json.load(f)
            if not isinstance(data, list):
                raise ValueError(f"expected a JSON list, got {type(data).__name__}")
            return data
        except ValueError as e:  # includes JSONDecodeError and UnicodeDecodeError
            # Move the unreadable file aside instead of overwriting it on the next save.
            backup = f"{self.memory_file}.corrupt-{datetime.now():%Y%m%d-%H%M%S}"
            os.replace(self.memory_file, backup)
            print(f"Warning: memory file was unreadable ({e}). "
                  f"Moved it to {backup} and starting with empty memory.")
            return []

    def save(self, entry: dict):
        entry["timestamp"] = datetime.now().isoformat()
        self.history.append(entry)
        with open(self.memory_file, "w") as f:
            json.dump(self.history, f, indent=2)

    def get_relevant(self, topic: str, n: int = 3) -> List[dict]:
        topic_words = set(topic.lower().split())
        scored = [
            (len(topic_words & set(e.get("topic", "").lower().split())), e)
            for e in self.history
        ]
        scored.sort(key=lambda x: (x[0], x[1].get("timestamp", "")), reverse=True)
        return [e for _, e in scored[:n]]

    def format_context(self, topic: str):
        relevant = self.get_relevant(topic)
        if not relevant:
            return "No previous posts found in memory."
        lines = ["PREVIOUS POSTS ON SIMILAR TOPICS (style reference — avoid repetition):"]
        for i, entry in enumerate(relevant, 1):
            lines.append(
                f"\n--- Post {i} | Topic: {entry.get('topic')} | "
                f"Validator: {entry.get('validation_score', 'N/A')}/10 | "
                f"Judge: {entry.get('judge_score', 'N/A')}/10 | "
                f"Tone: {entry.get('tone')} ---"
            )
            lines.append(entry.get("post_content", "")[:400])
        return "\n".join(lines)


class GeminiAgentClient:
    label = "Gemini"

    def __init__(self):
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            raise EnvironmentError("GEMINI_API_KEY must be set in .env.")
        self.client = OpenAI(
            base_url="https://generativelanguage.googleapis.com/v1beta/openai/",
            api_key=api_key,
        )
        self.model = GEMINI_MODEL

    def call(self, system: str, user: str):
        # Newer Gemini models spend hidden "thinking" tokens out of the same
        # max_tokens budget — too low a cap silently returns empty content.
        response = self.client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            temperature=0.7,
            max_tokens=8192,
        )
        return response.choices[0].message.content or ""


def _build_llm_client():
    return GeminiAgentClient()


class LLMJudge:
    def __init__(self, prompt_loader: PromptLoader):
        api_key = os.getenv("GEMINI_API_KEY")
        self.enabled = bool(api_key)
        if self.enabled:
            # Its own client instance so the judge stays decoupled from the pipeline agents.
            self.client = OpenAI(
                base_url="https://generativelanguage.googleapis.com/v1beta/openai/",
                api_key=api_key,
            )
            self.template = prompt_loader.load_prompt("judge")

    def evaluate(self, post_content: str, topic: str, tone: str, post_type: str):
        if not self.enabled:
            print("  [Judge] Skipped — GEMINI_API_KEY not set.")
            return {"overall_score": None, "verdict": "judge disabled — set GEMINI_API_KEY"}

        prompt = self.template.safe_substitute(
            post_content=post_content,
            topic=topic,
            tone=tone,
            post_type=post_type,
        )
        try:
            resp = self.client.chat.completions.create(
                model=GEMINI_MODEL,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.1,
                max_tokens=4096,
            )
            return _parse_json_object(resp.choices[0].message.content)
        except Exception as e:
            print(f"  [Judge] Evaluation failed: {e}")
            return {"overall_score": None, "verdict": "judge error"}


class PipelineState(TypedDict, total=False):
    topic: str
    tone: str
    post_type: str
    raw_research: dict
    research_insights: str
    post_data: dict
    write_failed: bool
    validation_data: dict
    judge_data: dict


class LinkedInPostGenerator:
    def __init__(self):
        self.llm = _build_llm_client()
        self.tavily = TavilyClient(api_key=os.getenv("TAVILY_API_KEY"))
        self.prompts = PromptLoader()
        self.memory = MemoryManager()
        self.judge = LLMJudge(self.prompts)

        self.research_agent = self.prompts.load_agent("research")
        self.writer_agent = self.prompts.load_agent("writer")
        self.validator_agent = self.prompts.load_agent("validator")

        self.graph = self._build_graph()

    @staticmethod
    def _agent_system_prompt(cfg: dict):
        return f"Role: {cfg['role']}\nGoal: {cfg['goal']}\nBackstory: {cfg['backstory']}"
    
    def _research_topic(self, topic):
        try:
            queries=[
                f"{topic} recent statistics",
                f"{topic} trends and recent news",
                f"{topic} expert opinions and analysis",
            ]
            data = {"topic":topic, "key_facts":[],"trending_angles":[], "sources":[]}
            for query in queries:
                resp = self.tavily.search(query=query, search_depth="advanced", max_results=3)
                for r in resp.get("results",[]):
                    data["sources"].append({
                        "title":r.get("title",""),
                        "url":r.get("url", ""),
                        "content":r.get("content", "")
                    })
            return data
        except Exception as e:
            print(f"Research failed: {e}")
            return {"topic":topic, "key_facts": [], "trending_angles": [], "sources": []}
        
    #every agent should be a node in a graph
    
    def _node_research(self, state:PipelineState):
        print("Step 1: Researching topic......")
        raw_research = self._research_topic(state["topic"])
        task_prompt = self.prompts.load_task("research").safe_substitute(
            topic= state['topic'],
            post_type=state['post_type'],
            research_data=json.dumps(raw_research, indent=2),
        )
        try:
            insights = self.llm.call(self._agent_system_prompt(self.research_agent), task_prompt)
        except Exception as e:
            print(f"Research synthesis error ")
            insights = ""
        if not insights:
            print(f"Passing the raw search resulrs to a writer instead")
            insights = json.dumps(raw_research, indent=2)
        print("Research Complete!")
        return {
            "raw_research": raw_research,
            "research_insights": insights
        }
        
    def _node_write(self, state:PipelineState):
        print("Step 2: Writing topic......")
        memory_context = self.memory.format_context(state["topic"])
        task_prompt = self.prompts.load_task("writing").safe_substitute(
            topic=state["topic"],
            tone=state["tone"],
            post_type=state["post_type"],
            research_insights=state["research_insights"],
            memory_context=memory_context,
        )
        try:
            raw = self.llm.call(self._agent_system_prompt(self.writer_agent), task_prompt)
            post_data = _parse_json_object(raw)
            content = post_data.get("post_content", "")
            if not isinstance(content, str) or not content.strip():
                raise ValueError("post_content is empty or not a string")
        except Exception as e:
            print(f"Writer error {e}")
            return {"write_failed":True}
        print("Writing Complete")
        return {"post_data": post_data, "write_failed":False}
    
    def _node_validate(self, state:PipelineState):
        print(f"Step 3: Validating post ({self.llm.label}) validator...")
        task_prompt = self.prompts.load_task("validation").safe_substitute(
            post_content=state["post_data"].get("post_content",""),
            research_insights=state["research_insights"],
            tone=state["tone"]
        )
        try:
            raw = self.llm.call(self._agent_system_prompt(self.validator_agent), task_prompt)
            validation_data=_parse_json_object(raw)
        except Exception as e:
            print(f"Validator error {e}")
            validation_data = {"validation_passed":False, "score":None,
                               "final_verdict":"not validated"}
        print("Validation Complete")
        return {"validation_data":validation_data}
    
    def _node_judge(self, state:PipelineState):
        print(f"Step 4: LLM Judge evaluation ...")
        judge_data = self.judge.evaluate(
            post_content=state["post_data"].get("post_content", ""),
            topic=state["topic"],
            tone=state["tone"],
            post_type=state["post_type"]
        )
        print(f"Judge evaluation complete")
        return {"judge_data": judge_data}
    
    def _node_memory(self, state: PipelineState):
        self.memory.save({
            "topic":state["topic"],
            "tone":state["tone"],
            "post_type":state["post_type"],
            "post_content":state["post_data"].get("post_content",""),
            "validation_score":state["validation_data"].get("score",0),
            "judge_score":state["judge_data"].get("overall_score",0),
            "prompt_version":PROMPT_VERSION
        })
        return {}
    
    @staticmethod
    def _route_after_write(state:PipelineState):
        return "failed" if state.get("write_failed", True) else "ok"
    
    def _build_graph(self):
        graph = StateGraph(PipelineState)
        graph.add_node("research", self._node_research)
        graph.add_node("write", self._node_write)
        graph.add_node("validate", self._node_validate)
        graph.add_node("judge", self._node_judge)
        graph.add_node("memory", self._node_memory)
        
        graph.set_entry_point("research")
        graph.add_edge("research", "write")
        graph.add_conditional_edges("write",self._route_after_write,{"ok": "validate", "failed": END})
        graph.add_edge("validate", "judge")
        graph.add_edge("judge", "memory")
        graph.add_edge("memory", END)
        return graph.compile()
    
    def generate_post(self,topic, tone, post_type):
        print(f"\nGenerating Linkedin post - topic {topic}, tone {tone}, post_type {post_type}")
        print("-" * 60)
        
        final_state = self.graph.invoke({
            "topic": topic,
            "tone": tone,
            "post_type": post_type
        })
        
        if final_state.get("write_failed"):
            return None
        
        return {
            "post":final_state["post_data"],
            "validation":final_state["validation_data"],
            "judge":final_state["judge_data"],
            "research_sources":len(final_state["raw_research"].get("sources",[])),
        }

def _print_score_bar(label, score, width=10):
    if score is None:
        print(f"{label:<22}: N/A")
        return
    if isinstance(score,str) and "/" in score:
        score = score.split("/")[0].strip()
    try:
        score=float(score)
    except (ValueError, TypeError):
        print(f"{label:<22}: Invalid score format")
        return
    filled = min(round(score),width)
    bar = "█" * filled + "░" * (width - filled)
    print(f"{label:<22}: {bar} {score:.1f}/10")
    

def main():
    generator = LinkedInPostGenerator()
    print("Linkedin post generator")
    print("="*40)
    
    topic = input("Enter your topic/idea: ").strip()
    if not topic:
        print("No topic entered. Exiting.")
        return
    
    print(f"\nTone options: professional, casual, thought-leader")
    tone = input("Select tone (default:professional): ").strip() or "professional"
    
    print(f"\nPost Types: story, hot-take, announcement, lesson-learned, thought-leader")
    post_type = input("Select post type (default:thought-leader): ").strip() or "thought-leader"
    
    result = generator.generate_post(topic, tone, post_type)
    
    if not result:
        print("Failed to generate post. please try again")
        return
    
    
    print("\n" + "=" * 60)
    print("GENERATION LINKEDIN POST")
    print("=" * 60)
    print(result['post']['post_content'])
    print(f"\n" + "-"*60)
    
    #scores
    print("Scores")
    v = result['validation']
    j = result['judge']
    _print_score_bar(f"Validator ({generator.llm.label})",v.get("score")) 
    _print_score_bar(f"Judge Gemini",j.get("overall_score"))
    if j.get("overall_score") is not None:
        print()
        _print_score_bar("  Hook", j.get("hook_score", 0))
        _print_score_bar("  Authenticity", j.get("authenticity_score", 0))
        _print_score_bar("  Clarity", j.get("clarity_score", 0))
        _print_score_bar("  Engagement", j.get("engagement_score", 0))
        _print_score_bar("  Tone Match", j.get("tone_match_score", 0))
    print(f"\nWord Count: {result['post'].get('word_count','N/A')}")
    print(f"Research sources: {result['research_sources']}")
    print(f"Prompt version:   {PROMPT_VERSION}")
        # Validator suggestions
    if v.get("suggestions"):
        print("\nValidator suggestions:")
        for s in v["suggestions"]:
            print(f"  - {s}")

    # Judge feedback
    if j.get("strengths"):
        print("\nJudge — strengths:")
        for s in j["strengths"]:
            print(f"  + {s}")
    if j.get("weaknesses"):
        print("\nJudge — weaknesses:")
        for w in j["weaknesses"]:
            print(f"  - {w}")
    if j.get("deductions"):
        print("\nJudge — deductions:")
        for d in j["deductions"]:
            print(f"  ! {d}")

    print(f"\nValidator verdict: {v.get('final_verdict', 'Unknown')}")
    print(f"Judge verdict:     {j.get('verdict', 'Unknown')}")


if __name__ == "__main__":
    main()

        