import mongoose from 'mongoose';

export function mongoOpts(session, extra = {}) {
  return session ? { ...extra, session } : { ...extra };
}

export function withSession(query, session) {
  if (session && query && typeof query.session === 'function') return query.session(session);
  return query;
}

function transactionsUnsupported(error) {
  const message = `${error?.message || ''}`;
  return error?.code === 20 || /replica set|transaction numbers are only allowed/i.test(message);
}

export async function withTransaction(work) {
  let session;
  try {
    session = await mongoose.startSession();
  } catch (error) {
    if (transactionsUnsupported(error)) return work(null);
    throw error;
  }

  try {
    let result;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result;
  } catch (error) {
    if (transactionsUnsupported(error)) return work(null);
    throw error;
  } finally {
    await session.endSession();
  }
}
