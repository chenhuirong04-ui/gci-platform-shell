
const BASE_URL = "https://script.google.com/macros/s/AKfycbzmyUtJonSdmAb8ZPkn09iSft8H2GAHsgeDJhkpeqKtpbXil5dCmGi9D0vFLU0WYPE6/exec";
const APP_KEY = "icare_deal";

const request = async (body: any, retries = 1): Promise<any> => {
  for (let i = 0; i <= retries; i++) {
    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 15000);
      const res = await fetch(BASE_URL, {
        method: 'POST',
        body: JSON.stringify({ ...body, app_key: APP_KEY }),
        signal: controller.signal
      });
      clearTimeout(id);
      return await res.json();
    } catch (e) {
      if (i === retries) return null;
      await new Promise(r => setTimeout(r, 1000));
    }
  }
};

export const pushSnapshot = (data: any) => 
  request({ 
    action: 'upsert', 
    table: 'snapshots', 
    data: [{ id: 'latest', content: JSON.stringify(data) }] 
  });

export const pullLatestSnapshot = async () => {
  const res = await request({ 
    action: 'query', 
    table: 'snapshots', 
    params: { id: 'latest' } 
  });
  const list = res?.data || res;
  if (Array.isArray(list) && list[0]?.content) {
    try {
      return JSON.parse(list[0].content);
    } catch (e) {
      return null;
    }
  }
  return null;
};
