import { testNutrient } from "./tree";

export { testNutrient };

export function textFile(content = "hello nutrient", name = "notes.txt") {
  return new File([content], name, { type: "text/plain" });
}

export function markdownFile(content = "# Notes\n\nhello nutrient", name = "notes.md") {
  return new File([content], name, { type: "text/markdown" });
}

export function imageFile(name = "photo.png") {
  return new File(["fake"], name, { type: "image/png" });
}
