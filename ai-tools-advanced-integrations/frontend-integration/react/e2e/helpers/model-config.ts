export const TEST_MODELS = [
  'ac_7xhfwyml::azure::gpt-5',
  'ac_7xhfwyml::azure::gpt-5-mini',
  'ac_7xhfwyml::google::gemini-3-flash-preview',
  'ac_7xhfwyml::google::gemini-3-pro-preview',
  'ac_7xhfwyml::openai::gpt-5-mini',
  'ac_7xhfwyml::openai::gpt-5.2',
  'ac_7xhfwyml::vertex::claude-opus-4-5@20251101',
  'ac_7xhfwyml::vertex::claude-sonnet-4-5@20250929',
  'ac_7xhfwyml::vertex::gemini-3-flash-preview',
  'ac_7xhfwyml::vertex::gemini-3-pro-preview',
  'ac_7xhfwyml::databricks::databricks-gpt-5-2',
];

export function getCurrentModel(): string {
  return process.env.TEST_MODEL || TEST_MODELS[0];
}

export function getModelSlug(model: string): string {
  return model.replace(/[^a-zA-Z0-9]/g, '-').replace(/-+/g, '-');
}
