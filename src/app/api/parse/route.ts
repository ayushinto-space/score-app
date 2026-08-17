import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI, Type, Schema } from '@google/genai';
import { writeFile, unlink } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const questionSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    questions: {
      type: Type.ARRAY,
      description: 'Extracted questions array.',
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          type: {
            type: Type.STRING,
            enum: ['mcq', 'multiple_correct', 'integer', 'fill_blank'],
          },
          section: { type: Type.STRING },
          question: {
            type: Type.STRING,
            description: 'Main question statement ONLY. Must NOT contain option choices or labels like (A), (B), (C), (D).',
          },
          options: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'Options list for MCQ/Multiple Correct questions.',
          },
          correctOptionIndex: {
            type: Type.INTEGER,
            description: 'Strict 0-based index of correct option for single MCQ (0 for A, 1 for B, 2 for C, 3 for D).',
          },
          correctOptionIndexes: {
            type: Type.ARRAY,
            items: { type: Type.INTEGER },
            description: 'Array of strict 0-based indices for multiple-correct questions.',
          },
          correctAnswer: {
            type: Type.STRING,
            description: 'Value or text answer for integer or fill_blank types.',
          },
          explanation: {
            type: Type.STRING,
            description: 'Short, concise step-by-step solution derivation using LaTeX ($...$).',
          },
        },
        required: ['id', 'question', 'explanation'],
      },
    },
  },
  required: ['questions'],
};

export async function POST(req: NextRequest) {
  let tempFilePath: string | null = null;
  let uploadedFileRef: any = null;

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded.' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const mimeType = file.type || 'application/pdf';

    tempFilePath = join(tmpdir(), `upload_${Date.now()}_${file.name}`);
    await writeFile(tempFilePath, buffer);

    uploadedFileRef = await ai.files.upload({
      file: tempFilePath,
      mimeType: mimeType,
    });

    const prompt = `
      You are an expert exam parser. Analyze ALL PAGES of the attached document and extract all questions.

      STRICT QUESTION & OPTION CLEANING RULES:
      1. CLEAN THE QUESTION STEM: Completely REMOVE inline option choices (e.g., "(A) ... (B) ... (C) ... (D) ...") from the 'question' text field. The 'question' string must contain ONLY the actual question text ending before the options start.
      2. PLACE CHOICES IN OPTIONS ARRAY: Extract option choices exclusively into the 'options' array without their prefixes like (A), (B), A., B., etc.
      3. For 'mcq', 'correctOptionIndex' MUST be a strict 0-based INTEGER (0 for A, 1 for B, 2 for C, 3 for D).
      4. Convert mathematical expressions to standard LaTeX ($...$ for inline, $$...$$ for block).
      5. Keep explanations concise (2-3 lines max) using LaTeX.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash-lite',
      contents: [
        {
          role: 'user',
          parts: [
            {
              fileData: {
                fileUri: uploadedFileRef.uri,
                mimeType: uploadedFileRef.mimeType,
              },
            },
            { text: prompt },
          ],
        },
      ],
      config: {
        responseMimeType: 'application/json',
        responseSchema: questionSchema,
        temperature: 0.1,
        maxOutputTokens: 8192,
      },
    });

    let rawText = response.text || '{}';

    let parsedData;
    try {
      parsedData = JSON.parse(rawText);
    } catch (parseError) {
      const lastIndex = rawText.lastIndexOf('}');
      if (lastIndex !== -1) {
        const repairedText = rawText.substring(0, lastIndex + 1) + ']}';
        try {
          parsedData = JSON.parse(repairedText);
        } catch {
          throw new Error('Response payload was truncated. Try uploading a smaller page range.');
        }
      } else {
        throw parseError;
      }
    }

    return NextResponse.json(parsedData);

  } catch (error: any) {
    console.error('Parsing error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to parse document.' },
      { status: 500 }
    );

  } finally {
    if (tempFilePath) {
      await unlink(tempFilePath).catch(() => { });
    }
    if (uploadedFileRef?.name) {
      await ai.files.delete({ name: uploadedFileRef.name }).catch(() => { });
    }
  }
}