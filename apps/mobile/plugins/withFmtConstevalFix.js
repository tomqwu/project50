const { withDangerousMod } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

/**
 * fmt 11.0.2 — pinned by React Native 0.76 (third-party-podspecs/fmt.podspec,
 * tag 11.0.2) — enables a `consteval` FMT_STRING path whenever the compiler
 * advertises `__cpp_consteval` (fmt/base.h). Xcode 26.5's clang advertises it
 * but rejects fmt's usage ("call to consteval function ... is not a constant
 * expression"), so Pods/fmt/format-inl.h fails to compile and the whole iOS
 * build dies. fmt 11.0.2 predates this toolchain, so its own compiler check
 * can't know to disable consteval here.
 *
 * fmt re-defines FMT_USE_CONSTEVAL unconditionally in base.h, so a -D override
 * does nothing — the header itself must be patched. Because the native iOS
 * project is generated (ios/ is gitignored), inject a post_install step into
 * the Podfile that forces `FMT_USE_CONSTEVAL 0` in the installed fmt header,
 * making FMT_STRING fall back to constexpr. Idempotent.
 */
const FMT_PATCH = [
  "    # fmt 11.0.2 consteval is rejected by Xcode 26.5 clang — force it off in",
  "    # the installed header (a -D is overridden by fmt/base.h's own #define).",
  "    fmt_base = File.join(installer.sandbox.root, 'fmt', 'include', 'fmt', 'base.h')",
  "    if File.exist?(fmt_base)",
  "      original = File.read(fmt_base)",
  "      forced = original.gsub(/#  define FMT_USE_CONSTEVAL 1/, '#  define FMT_USE_CONSTEVAL 0')",
  "      File.write(fmt_base, forced) if forced != original",
  "    end",
  "",
].join("\n") + "\n";

const withFmtConstevalFix = (config) =>
  withDangerousMod(config, [
    "ios",
    (cfg) => {
      const podfilePath = path.join(
        cfg.modRequest.platformProjectRoot,
        "Podfile",
      );
      const contents = fs.readFileSync(podfilePath, "utf8");
      if (contents.includes("fmt 11.0.2 consteval")) return cfg;

      const patched = contents.replace(
        /post_install do \|installer\|\n/,
        (match) => match + FMT_PATCH,
      );
      if (patched === contents) {
        throw new Error(
          "withFmtConstevalFix: no post_install block found in the generated Podfile",
        );
      }
      fs.writeFileSync(podfilePath, patched);
      return cfg;
    },
  ]);

module.exports = withFmtConstevalFix;
