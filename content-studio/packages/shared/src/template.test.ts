import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fill, listPlaceholders, splitTemplate } from "./template";

describe("fill (port of string.Template.safe_substitute)", () => {
  it("replaces $name and ${name}", () => {
    assert.equal(fill("Hi $name, ${greeting}!", { name: "Ada", greeting: "welcome" }), "Hi Ada, welcome!");
  });

  it("leaves unknown placeholders and a lone $ untouched", () => {
    assert.equal(fill("$known $unknown ${other} costs $ 5", { known: "x" }), "x $unknown ${other} costs $ 5");
  });

  it("turns $$ into a literal $", () => {
    assert.equal(fill("$$topic", { topic: "x" }), "$topic");
  });

  it("never re-expands substituted values that contain $", () => {
    assert.equal(fill("$a", { a: "$17 billion $b", b: "nope" }), "$17 billion $b");
  });

  it("matches identifiers case-insensitively, like Python", () => {
    assert.equal(fill("$Topic", { Topic: "x" }), "x");
  });
});

describe("listPlaceholders", () => {
  it("returns distinct names in order and skips $$ escapes", () => {
    assert.deepEqual(listPlaceholders("$a ${b} $$c $a"), ["a", "b"]);
  });
});

describe("splitTemplate", () => {
  it("separates literal text from placeholders", () => {
    assert.deepEqual(splitTemplate("Hi $name, $$5 ${x}"), [
      { text: "Hi " },
      { text: "$name", placeholder: "name" },
      { text: ", $$5 " },
      { text: "${x}", placeholder: "x" },
    ]);
  });
});
