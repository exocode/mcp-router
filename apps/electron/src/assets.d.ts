// Ambient declarations for webpack asset imports.
//
// IMPORTANT: this file must stay a "script" (no top-level import/export).
// Wildcard `declare module` patterns only apply globally from script-mode
// .d.ts files. The `?inline` query has no matching file on disk, so it relies
// entirely on this ambient declaration (unlike "*.png" in global.d.ts, which
// also resolves against the real file). See webpack.rules.ts for the matching
// asset/inline rule.
declare module "*.png?inline" {
  const value: string;
  export default value;
}
