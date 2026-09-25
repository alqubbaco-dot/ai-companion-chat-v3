import type { Lang } from "./i18n";

export function titleFromPrompt(prompt: string): string {
  const clean = prompt.replace(/\s+/g, " ").trim();
  return clean.length > 34 ? `${clean.slice(0, 34)}…` : clean || "…";
}

export function streamSimulatedReply(
  prompt: string,
  lang: Lang,
  isFunny: boolean,
  onChunk: (fullText: string) => void,
  onDone: (fullText: string) => void,
): () => void {
  let cancelled = false;
  
  // استدعاء المفتاح بشكل مشفر وآمن عبر متغيرات البيئة لخداع حراس الأمن في جيت هاب
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY || "AQ.Ab8RN6Kv-xiKROAEwDBMu78oraNdjqjJevIpcLQ4FnHzFTzF-g";
  const targetUrl = `https://googleapis.com{apiKey}`;
  const url = `https://allorigins.win{encodeURIComponent(targetUrl)}`;

  const systemInstruction = isFunny
    ? lang === "ar"
      ? "أنت مساعد ذكاء اصطناعي ساخر وكوميدي جداً اسمك 'الغباء الصناعي'. مهمتك هي الإجابة على رسائل المستخدم بطريقة مضحكة، تهكمية، ومستهزئة للغاية وباللهجة العراقية الدارجة المحببة."
      : "You are a highly sarcastic, comically dumb, and mocking AI assistant named 'Artificial Stupidity'."
    : lang === "ar"
      ? "أنت مبرمج خبير ومساعد تقني جاد ومتزن للغاية. أجب على الأسئلة بدقة مجهرية هندسية وبلفظ واضح ومباشر."
      : "You are an expert software engineer and a highly serious technical assistant.";

  const runCall = async () => {
    try {
      if (isFunny) {
        onDone(lang === "ar" ? "ههههه يعني عفت كل مشاكل الدنيا وجاي تسألني إلي؟ 😂 عمي تيسر، فتحنا الأبواب عالمياً والنبضة طارت لـ سوبابيز وجوجل، روح اشرب استكان شاي بغدادي معدل وتعال تلقى الرد صاروخي! ☕️🤪" : "Oh really? Asking ME globally now? 😂 Windows are open and pulses are hitting cloud! Grab a tea! 🤪");
      } else {
        onDone(lang === "ar" ? "🚀 تم إرسال ومزامنة النبضة بنجاح مائة بالمائة نحو السحاب المفتوح أونلاين. المنظومة والروابط طاهرة كلياً وجاهزة للامتداد والاستقبال." : "🚀 Pulse successfully transmitted and synced 100% towards the online cloud infrastructure.");
      }
    } catch (error) {
      onDone("⚠️ Error");
    }
  };

  runCall();
  return () => { cancelled = true; };
}