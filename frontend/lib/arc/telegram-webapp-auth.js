import { createHmac, timingSafeEqual } from 'node:crypto';

const MAX_INIT_DATA_AGE_SECONDS = 60 * 60;

export function verifyTelegramWebAppInitData(initData, botToken, { now = Date.now(), maxAgeSeconds = MAX_INIT_DATA_AGE_SECONDS } = {}) {
  if (typeof initData !== 'string' || !initData || initData.length > 16_384) throw new Error('Telegram sign-in data is missing or invalid.');
  if (!botToken) throw new Error('Telegram sign-in is not configured.');

  const values = new URLSearchParams(initData);
  const suppliedHash = values.get('hash');
  if (!suppliedHash || !/^[a-f0-9]{64}$/i.test(suppliedHash)) throw new Error('Telegram sign-in data is invalid. Open the claim screen from the NairaTag bot again.');

  const authDate = Number(values.get('auth_date'));
  const nowSeconds = Math.floor(now / 1000);
  if (!Number.isSafeInteger(authDate) || authDate > nowSeconds + 60 || nowSeconds - authDate > maxAgeSeconds) {
    throw new Error('Telegram sign-in has expired. Reopen the claim screen from the NairaTag bot.');
  }

  const dataCheckString = [...values.entries()]
    .filter(([key]) => key !== 'hash')
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expectedHash = createHmac('sha256', secretKey).update(dataCheckString).digest();
  const actualHash = Buffer.from(suppliedHash, 'hex');
  if (actualHash.length !== expectedHash.length || !timingSafeEqual(actualHash, expectedHash)) {
    throw new Error('Telegram could not verify this sign-in. Reopen the claim screen from the NairaTag bot.');
  }

  let user;
  try { user = JSON.parse(values.get('user') || 'null'); }
  catch { throw new Error('Telegram account details are invalid.'); }
  if (!user || !Number.isSafeInteger(Number(user.id)) || Number(user.id) <= 0) throw new Error('Telegram account details are missing.');

  return {
    id: String(user.id),
    username: typeof user.username === 'string' ? user.username.slice(0, 64) : null,
    firstName: typeof user.first_name === 'string' ? user.first_name.slice(0, 128) : null,
    lastName: typeof user.last_name === 'string' ? user.last_name.slice(0, 128) : null,
    languageCode: typeof user.language_code === 'string' ? user.language_code.slice(0, 16) : null,
  };
}
