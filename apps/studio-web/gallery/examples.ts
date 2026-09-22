// Canonical corpus: content/projects/<project>/*.forge.ts.
// Keep this real Vite glob covered by examples.test.ts (not a mocked loader).
export const exampleModules = import.meta.glob("../../../content/projects/*/*.forge.ts", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

export const examples = Object.entries(exampleModules)
  .map(([path, code]) => {
    const file = path.split("/").pop()!;
    const name = file.replace(/\.forge\.ts$/, "").split("-")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
    return { name, file, code: code.trim() };
  })
  .sort((a, b) => a.name.localeCompare(b.name) || a.file.localeCompare(b.file));

if (examples.length === 0) {
  throw new Error("No models found in content/projects/*/*.forge.ts");
}
