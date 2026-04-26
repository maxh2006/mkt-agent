import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native + native-binding-heavy server-only packages that Turbopack
  // can't / shouldn't bundle into the build output. They're loaded
  // from `node_modules/` at runtime via Node's normal resolver.
  //
  // - @resvg/resvg-js  → ships a `.node` native binding (SVG → PNG
  //                      rasterizer for the deterministic overlay
  //                      renderer at src/lib/ai/render/).
  // - satori           → pure JS but imports `yoga.wasm`; safer to
  //                      keep external alongside its sibling.
  serverExternalPackages: ["@resvg/resvg-js", "satori"],
};

export default nextConfig;
