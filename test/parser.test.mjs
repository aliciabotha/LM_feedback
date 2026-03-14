import assert from "assert";
import { detectCategory, extractChatter, extractModel } from "../parser.mjs";

// Category extraction tests
assert.strictEqual(detectCategory("FB this is feedback", "general"), "FB");
assert.strictEqual(detectCategory("Just a note", "fb-ruby"), "FB");
assert.strictEqual(detectCategory("DOCK: booked commission", "random"), "DOCK");
assert.strictEqual(detectCategory("DOCK: warning only", "random"), "FB");
assert.strictEqual(detectCategory("Some text", "ms-modelsupport"), "MS");
assert.strictEqual(detectCategory("No trigger", "no-category"), null);

// Chatter extraction tests
assert.strictEqual(extractChatter("Hey @jack please read"), "jack");
assert.strictEqual(extractChatter("No mention here"), "");

// Model extraction tests
assert.strictEqual(extractModel("fb-ruby", "fb-ruby"), "Ruby");
assert.strictEqual(extractModel("FB-Oak", "feedback"), "Oak");
assert.strictEqual(extractModel("Reporting on Clara's stats", "feedback"), "Clara");
assert.strictEqual(extractModel("Model metrics on Eli", "feedback"), "Eli");
assert.strictEqual(extractModel("No model here", "random"), "");

console.log("✓ parser tests passed");
