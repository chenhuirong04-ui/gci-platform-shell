// GCI Executive Desk — Task 11.1: Ask GCI quick entries into the Email
// Chat Assistant. Pure regex matching only — these just navigate; Task 5.2's
// existing Gmail search/important-emails queries are untouched and still
// handle "找一下...邮件" / "有哪些重要邮件" style queries.
export const OPEN_EMAIL_ASSISTANT_RE = /打开邮件助理|和我讨论这封邮件|帮我回复这封邮件|打开邮件聊天助理/u;
