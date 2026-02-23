import { GoogleGenAI } from "@google/genai";

export class AiService {
  async cleanCommits(commitsArray: any[], callerApiKey?: string) {
    const apiKey = callerApiKey || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("Gemini API key not set. Masukkan API key di dashboard (ikon ⚙️) atau set GEMINI_API_KEY di environment variables.");
    }

    if (!commitsArray || commitsArray.length === 0) {
      return [];
    }

    const payloadStr = JSON.stringify(commitsArray.map((c, index) => ({
      id: index,
      originalTitle: c.title || (c.message ? c.message.split('\n')[0] : 'No Title'),
      originalMessage: c.message
    })));

    const prompt = `You are a professional technical writer and software engineering manager. I am going to give you a JSON array of raw, messy Git commit messages.
Your job is to clean them up for a professional client-facing report.

Rules:
1. Fix typos, capitalization, and grammar.
2. Ensure the "title" is a short, readable, professional summary of the task (e.g. "Fix button color" -> "Fixed Button Color Issue").
3. Ensure the "message" is a neatly formatted description without weird markdown or raw git SHAs. If the original message is basically just the title, you can elaborate slightly to make it sound like a completed task, but do not invent features. Keep it concise.
4. You MUST return ONLY a valid JSON array. No markdown blocks, no \`\`\`json wrappers, just the raw JSON array string.
5. The output array must contain objects with exactly these three keys: "id" (must match the input id), "title", and "message".

Input Data:
${payloadStr}`;

    try {
      const ai = new GoogleGenAI({ apiKey: apiKey });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
      });

      let responseText = response.text || "[]";
      
      // Strip potential markdown wrappers just in case the model ignores the instruction
      if (responseText.startsWith("```json")) {
        responseText = responseText.replace(/^```json\n?/, '').replace(/\n?```$/, '');
      } else if (responseText.startsWith("```")) {
        responseText = responseText.replace(/^```\n?/, '').replace(/\n?```$/, '');
      }

      const cleanedData = JSON.parse(responseText.trim());

      // Merge the cleaned title and message back into the original commit objects based on ID
      const polishedCommits = commitsArray.map((originalCommit, index) => {
        const cleaned = cleanedData.find((c: any) => c.id === index);
        if (cleaned) {
          return {
            ...originalCommit,
            title: cleaned.title,
            message: cleaned.message,
            isAiCleaned: true
          };
        }
        return originalCommit; // fallback to original if ID matching fails
      });

      return polishedCommits;
    } catch (error) {
      console.error("AI Service Error:", error);
      throw new Error("Failed to process commits with Gemini AI.");
    }
  }
}
