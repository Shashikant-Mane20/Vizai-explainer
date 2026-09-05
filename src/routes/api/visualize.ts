import { createFileRoute } from "@tanstack/react-router";
import {
  LESSON_JSON_SCHEMA,
  LessonSchema,
  VisualizeRequestSchema,
  type Lesson,
} from "@/lib/visualize-schema";

const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_MODEL = "gemini-3.6-flash";

const STYLE_HINTS: Record<string, string> = {
  simple: "Use very simple words, short sentences, and one idea per step.",
  detailed: "Be thorough and precise; include mechanisms, causes, and effects.",
  real_world_examples: "Anchor every step in a concrete, everyday real-world example.",
  exam_focused: "Emphasize definitions, key terms, formulas, and common exam pitfalls.",
  story_analogy: "Teach through a running story or analogy that maps onto the concept.",
};

const SYSTEM_PROMPT = `You are an expert AI teacher who explains any educational topic by DRAWING on an interactive digital textbook canvas and narrating step by step.

You must output ONLY JSON matching the provided schema. It describes a visual scene plus a lesson walkthrough.

## Choosing the visual (visualType)
Pick the single best representation for the topic:
- flowchart / process: sequential procedures, algorithms, "how X works"
- cycle: repeating loops (water cycle, cell cycle, business cycles)
- timeline: history, chronological events, evolution
- concept_map: relationships between ideas, vocabulary networks
- hierarchy: classification, org charts, taxonomies, tree structures
- comparison: contrasting two or more things side by side (columns)
- graph / math: functions, equations, rates, geometry, physics relationships (use "chart" when a plotted curve helps)
- code_flow: programs, data structures, control flow (nodes are code steps / memory)
- scientific_illustration: anatomy, apparatus, structures (nodes are labelled parts)
- diagram: anything else structural

## Canvas & layout rules
- The canvas is a 16:10 rectangle. Node x and y are percentages 0..100 (x left→right, y top→bottom).
- Use 4 to 12 nodes. Spread them out; keep at least 14 units apart on x OR 16 on y so labels never overlap. Labels ≤ 4 words; sublabel ≤ 6 words or null.
- Layout by type: timeline → nodes along y≈50 with increasing x (alternate sublabels); flowchart/process → left-to-right or top-to-bottom; cycle → arranged on a circle around (50,50); hierarchy → root at top, levels below; comparison → two vertical columns at x≈28 and x≈72 with headers at y≈12; concept_map → hub near center, satellites around.
- color: 1..5 palette index. Use the same color for nodes of the same category.
- icon: a single emoji that represents the node, or null.
- Edges connect node ids; label ≤ 3 words or null; style "dashed" for weak/indirect relations. Every edge must reference existing node ids.
- chart: only for graph/math topics that benefit from a plotted curve, else null. Provide 12–40 points per series with realistic values. Node ids and series ids can both be highlighted in steps.

## Teaching steps
- 4 to 8 steps. Each step introduces or focuses on a few nodes/edges by id (highlightNodes / highlightEdges). Nodes are revealed progressively: a node should appear in a step before or when it is discussed. The final step should highlight everything relevant to show the whole picture.
- title: ≤ 6 words. annotation: ≤ 12 words shown ON the canvas as a callout. explanation: 2–4 sentences spoken by the teacher, adapted to the grade level. formula: plain-text formula/equation if relevant, else null.
- Use the student's grade: vocabulary, depth, and examples must match it.
- keyTakeaways: 3–5 crisp bullets. quiz: one multiple-choice question with 3–4 options and a short explanation.`;

function corsHeaders(extra: Record<string, string> = {}) {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    ...extra,
  };
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders(headers) });
}

function toGeminiSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(toGeminiSchema);
  if (!schema || typeof schema !== "object") return schema;

  const value = schema as Record<string, unknown>;
  const normalized = Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== "additionalProperties")
      .map(([key, entry]) => [key, toGeminiSchema(entry)]),
  ) as Record<string, unknown>;

  if (Array.isArray(value["type"])) {
    const nonNullType = value["type"].find((type) => type !== "null");
    if (nonNullType) normalized["type"] = nonNullType;
    normalized["nullable"] = true;
  }

  return normalized;
}

/** Drop dangling references so the renderer never breaks on model slips. */
function sanitize(lesson: Lesson): Lesson {
  const nodeIds = new Set(lesson.nodes.map((n) => n.id));
  const seriesIds = new Set(lesson.chart?.series.map((s) => s.id) ?? []);
  const edges = lesson.edges.filter((e) => nodeIds.has(e.from) && nodeIds.has(e.to));
  const edgeIds = new Set(edges.map((e) => e.id));
  const steps = lesson.steps.map((s) => ({
    ...s,
    highlightNodes: s.highlightNodes.filter((id) => nodeIds.has(id) || seriesIds.has(id)),
    highlightEdges: s.highlightEdges.filter((id) => edgeIds.has(id)),
  }));
  const nodes = lesson.nodes.map((n) => ({
    ...n,
    x: Math.min(100, Math.max(0, n.x)),
    y: Math.min(100, Math.max(0, n.y)),
  }));
  return { ...lesson, nodes, edges, steps };
}

export const Route = createFileRoute("/api/visualize")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders() }),
      POST: async ({ request }) => {
        let raw: unknown;
        try {
          raw = await request.json();
        } catch {
          return json({ error: "Body must be JSON" }, 400);
        }
        const parsed = VisualizeRequestSchema.safeParse(raw);
        if (!parsed.success) {
          return json({ error: "Invalid input", details: parsed.error.flatten() }, 400);
        }
        const { topic, subject, grade, explanation } = parsed.data;

        const apiKey = process.env["GEMINI_API_KEY"] ?? process.env["GOOGLE_API_KEY"];
        if (!apiKey) {
          return json({ error: "Gemini is not configured. Add GEMINI_API_KEY to your .env file." }, 500);
        }

        const model = process.env["GEMINI_MODEL"] ?? DEFAULT_MODEL;

        const userPrompt = `Topic: ${topic}
Subject: ${subject}
Grade / level: ${grade}
Explanation style: ${explanation.replace(/_/g, " ")} — ${STYLE_HINTS[explanation] ?? ""}

Design the best visual for this topic and teach it step by step. Return JSON only.`;

        const requestBody = JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [{ role: "user", parts: [{ text: userPrompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: toGeminiSchema(LESSON_JSON_SCHEMA),
          },
        });

        let res: Response | undefined;
        for (let attempt = 0; attempt < 3; attempt += 1) {
          try {
            res = await fetch(`${GEMINI_API_URL}/${model}:generateContent?key=${encodeURIComponent(apiKey)}`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: requestBody,
            });
          } catch (err) {
            console.error("visualize: Gemini API unreachable", err);
            return json({ error: "Could not reach the AI service. Please try again." }, 502);
          }

          if (res.status !== 503 || attempt === 2) break;
          await new Promise((resolve) => setTimeout(resolve, 600 * (attempt + 1)));
        }

        if (!res) return json({ error: "Could not reach the AI service. Please try again." }, 502);

        if (!res.ok) {
          const text = await res.text().catch(() => "");
          console.error("visualize: Gemini API error", res.status, text);
          if (res.status === 429) {
            return json(
              { error: "Too many requests right now. Please wait a moment and try again." },
              429,
              res.headers.get("Retry-After") ? { "Retry-After": res.headers.get("Retry-After")! } : {},
            );
          }
          if (res.status === 402) {
            return json({ error: "The Gemini API account has no available credits." }, 402);
          }
          if (res.status === 403) {
            return json({ error: "Gemini rejected the API key. Check GEMINI_API_KEY and its permissions." }, 403);
          }
          if (res.status === 503) {
            return json(
              { error: "Gemini is temporarily busy. Please wait a moment and try again." },
              503,
              { "Retry-After": "3" },
            );
          }
          return json({ error: "The AI teacher could not build this lesson. Please try again." }, 502);
        }

        const data = (await res.json()) as {
          candidates?: { content?: { parts?: { text?: string }[] } }[];
        };
        const content = data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
        let lessonRaw: unknown;
        try {
          lessonRaw = JSON.parse(content.replace(/^```(?:json)?\s*|\s*```$/g, ""));
        } catch {
          console.error("visualize: non-JSON content", content.slice(0, 400));
          return json({ error: "The AI returned an unreadable lesson. Please try again." }, 502);
        }
        const lesson = LessonSchema.safeParse(lessonRaw);
        if (!lesson.success) {
          console.error("visualize: schema mismatch", lesson.error.flatten());
          return json({ error: "The AI lesson was incomplete. Please try again." }, 502);
        }
        return json({ lesson: sanitize(lesson.data), input: parsed.data });
      },
    },
  },
});
