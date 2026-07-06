import { z } from "zod";

import { validateMacroScriptSignature } from "@/shared/macro-signature";
import { validateRunScopePattern } from "@/shared/run-scope";
import {
  MacroEditableDocumentSchema,
  MacroSchema,
  macroEditableFieldKeys,
  type Macro,
  type MacroEditableDocument,
} from "@/shared/types/macro";

export type MacroEditResult =
  | { ok: true; macro: Macro }
  | { ok: false; error: string };

export const MacroEditSchema = MacroSchema.superRefine((macro, ctx) => {
  applyMacroSemanticChecks(macro, ctx);
});

export const MacroEditableDocumentEditSchema = MacroEditableDocumentSchema.strict().superRefine(
  (document, ctx) => {
    applyMacroSemanticChecks(document, ctx);
  },
);

function applyMacroSemanticChecks(
  value: Pick<Macro, "runScope" | "script" | "signature">,
  ctx: z.RefinementCtx,
): void {
  if (value.runScope) {
    const patternError = validateRunScopePattern(value.runScope.pattern);
    if (patternError) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["runScope", "pattern"],
        message: `Invalid regex: ${patternError}`,
      });
    }
  }

  if (value.script) {
    const syncError = validateMacroScriptSignature(
      value.script,
      value.signature?.params ?? [],
    );
    if (syncError) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["script"],
        message: syncError,
      });
    }
  }
}

export function macroEditableDocumentFromMacro(macro: Macro): MacroEditableDocument {
  return MacroEditableDocumentSchema.parse(macro);
}

export function mergeEditableDocument(
  original: Macro,
  document: MacroEditableDocument,
): Macro {
  const editableFields = Object.fromEntries(
    macroEditableFieldKeys.map((key) => [key, document[key]]),
  ) as MacroEditableDocument;

  return {
    ...original,
    ...editableFields,
    updatedAt: Date.now(),
  };
}

export function formatMacroForEdit(macro: Macro): string {
  return JSON.stringify(macroEditableDocumentFromMacro(macro), null, 2);
}

function formatZodIssuePath(path: (string | number)[]): string {
  if (path.length === 0) {
    return "";
  }
  return path.join(".");
}

export function formatMacroEditError(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) {
    return "Invalid macro.";
  }

  const path = formatZodIssuePath(issue.path);
  return path ? `${path}: ${issue.message}` : issue.message;
}

function parseJsonSyntax(
  text: string,
): { ok: true; value: unknown } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (error) {
    const message = error instanceof SyntaxError ? error.message : "Invalid JSON.";
    return { ok: false, error: message };
  }
}

/** Structural + semantic validation for a full macro object. */
export function validateMacroEdit(macro: Macro): MacroEditResult {
  const parsed = MacroEditSchema.safeParse(macro);
  if (!parsed.success) {
    return { ok: false, error: formatMacroEditError(parsed.error) };
  }

  return { ok: true, macro: parsed.data };
}

export function assertMacroEditable(macro: Macro): Macro {
  const result = validateMacroEdit(macro);
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.macro;
}

export function parseMacroEditJson(text: string, original: Macro): MacroEditResult {
  const syntax = parseJsonSyntax(text);
  if (!syntax.ok) {
    return syntax;
  }

  const parsed = MacroEditableDocumentEditSchema.safeParse(syntax.value);
  if (!parsed.success) {
    return { ok: false, error: formatMacroEditError(parsed.error) };
  }

  const merged = mergeEditableDocument(original, parsed.data);
  const validated = MacroEditSchema.safeParse(merged);
  if (!validated.success) {
    return { ok: false, error: formatMacroEditError(validated.error) };
  }

  return {
    ok: true,
    macro: {
      ...validated.data,
      id: original.id,
      createdAt: original.createdAt,
      updatedAt: Date.now(),
    },
  };
}

export function readShortcutFromText(text: string, fallback: Macro): string | undefined {
  const syntax = parseJsonSyntax(text);
  if (!syntax.ok || typeof syntax.value !== "object" || syntax.value === null) {
    return fallback.shortcut;
  }

  const shortcut = (syntax.value as { shortcut?: unknown }).shortcut;
  return typeof shortcut === "string" ? shortcut : undefined;
}

export function patchMacroShortcutInText(
  text: string,
  fallback: Macro,
  shortcut: string | undefined,
): string {
  const syntax = parseJsonSyntax(text);
  const base =
    syntax.ok && typeof syntax.value === "object" && syntax.value !== null
      ? { ...(syntax.value as Record<string, unknown>) }
      : { ...macroEditableDocumentFromMacro(fallback) };

  if (shortcut) {
    base.shortcut = shortcut;
  } else {
    delete base.shortcut;
  }

  return JSON.stringify(base, null, 2);
}

export function addMacroParamToText(text: string, fallback: Macro): string {
  const syntax = parseJsonSyntax(text);
  const base =
    syntax.ok && typeof syntax.value === "object" && syntax.value !== null
      ? { ...(syntax.value as Record<string, unknown>) }
      : { ...macroEditableDocumentFromMacro(fallback) };

  const signature =
    typeof base.signature === "object" && base.signature !== null
      ? (base.signature as { version?: number; params?: unknown[] })
      : { version: 1, params: [] };

  const params = Array.isArray(signature.params) ? [...signature.params] : [];
  const used = new Set(
    params
      .map((param) =>
        typeof param === "object" && param !== null && "name" in param
          ? String((param as { name: unknown }).name)
          : "",
      )
      .filter(Boolean),
  );

  let name = "newParam";
  for (let n = 2; used.has(name); n++) {
    name = `newParam${n}`;
  }

  params.push({ name, label: "New parameter", type: "string" });
  base.signature = { version: 1, params };

  return JSON.stringify(base, null, 2);
}
