console.log("openai service loaded");

import OpenAI from "openai";

const apiKey = process.env.OPENAI_API_KEY;
export const openai = apiKey ? new OpenAI({ apiKey }) : null;

export async function parseLinkedInTextToJson(text: string) {
  if (!openai) throw new Error("OPENAI_API_KEY is not set");
  const completion = await openai.chat.completions.create({
    model: "gpt-4-turbo",
    max_tokens: 1024,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You are a helpful assistant that extracts structured data from LinkedIn profiles. Always respond with valid JSON.",
      },
      {
        role: "user",
        content: `Extract structured information from this LinkedIn profile PDF text. Return ONLY valid JSON with these exact fields (use null for missing fields):

{
  "name": "Full name without nicknames",
  "headline": "Professional headline (the line with | separators)",
  "location": "City, State/Country",
  "company": "Current company name",
  "role": "Current job title",
  "about": "Summary/About section text",
  "experience": "Experience section text (first 1000 chars)",
  "education": "Education section text (first 500 chars)",
  "skills": "Comma-separated skills from Top Skills section"
}

LinkedIn Profile Text:
${text.slice(0, 15000)}`,
      },
    ],
  });

  const responseText = completion.choices[0]?.message?.content || "";
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Could not extract JSON from OpenAI response");

  const parsed = JSON.parse(jsonMatch[0]);
  Object.keys(parsed).forEach((k) => {
    if (parsed[k] === null) parsed[k] = undefined;
  });
  return parsed;
}

export async function generateDraft(prompt: string) {
  if (!openai) throw new Error("OPENAI_API_KEY is not set");
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: 400,
    messages: [{ role: "user", content: prompt }],
  });
  return res.choices[0]?.message?.content ?? "";
}
