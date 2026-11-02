/** תשתית משותפת לבדיקות: אובייקטי Discord מדומים. */
process.env.DB_PATH = process.env.DB_PATH || ':memory:';

const SECRET = 'a'.repeat(40);
process.env.API_SECRET = SECRET;

function collection(items = []) {
  const arr = [...items];
  return {
    size: arr.length,
    values: () => arr[Symbol.iterator](),
    last: () => arr[arr.length - 1],
    [Symbol.iterator]: () => arr[Symbol.iterator](),
  };
}

function fakeMember(id, { roles = [], perms = [], createdDaysAgo = 400, guild } = {}) {
  const set = new Set(roles);
  const m = {
    id, guild, nickname: null, manageable: true, moderatable: true, bannable: true, kickable: true,
    user: { id, tag: `user${id}#0`, username: `user${id}`, createdTimestamp: Date.now() - createdDaysAgo * 864e5, displayAvatarURL: () => 'https://cdn.example.com/a.png' },
    permissions: { has: (p) => perms.includes(p) },
    roles: {
      cache: { has: (r) => set.has(r) },
      highest: { position: 1 },
      add: async (r) => { if (m.failRoles) throw new Error('Missing Permissions'); set.add(r); },
      remove: async (r) => { if (m.failRoles) throw new Error('Missing Permissions'); set.delete(r); },
    },
    setNickname: async (n) => { if (m.failRoles) throw new Error('Missing Permissions'); m.nickname = n; },
    timeout: async (ms) => { m.timedOutFor = ms; m.timeouts = (m.timeouts ?? 0) + 1; },
    send: async () => {},
    _roles: set,
  };
  return m;
}

function fakeGuild(id = 'g1', { client } = {}) {
  const sent = [];
  const channels = new Map();
  const g = {
    id, name: 'Test Guild', ownerId: 'owner', iconURL: () => null,
    sent, channels: { cache: channels, create: null, fetch: async (cid) => { const c = channels.get(cid); if (!c) throw Object.assign(new Error('Unknown Channel'), { code: 10003, status: 404 }); return c; } },
    roles: { cache: new Map(), everyone: { id } },
    members: { me: { roles: { highest: { position: 10 } } }, fetch: async () => null, unban: async () => {}, ban: async () => {} },
    client: client ?? { user: { id: 'bot' }, users: { fetch: async () => ({ send: async () => {} }) } },
  };
  return g;
}

function fakeTextChannel(id, { fail = false } = {}) {
  const messages = [];
  const ch = {
    id, name: id, topic: '', messages, deleted: false,
    isTextBased: () => true,
    send: async (m) => { if (fail) throw new Error('Missing Access'); messages.push(m); return { id: `m${messages.length}`, url: 'u' }; },
    delete: async () => { ch.deleted = true; },
    messages_api: null,
  };
  ch.messages = Object.assign(messages, {
    fetch: async ({ before } = {}) => (before ? collection([]) : collection(ch.history ?? [])),
  });
  return ch;
}

function fakeInteraction({ guild, user, member, channel, fields = {}, values, message } = {}) {
  const calls = { replies: [], edits: [], follow: [] };
  const i = {
    guild, user, member, channel, message, values,
    client: guild.client,
    calls,
    deferred: false, replied: false,
    fields: { getTextInputValue: (k) => fields[k] },
    reply: async (x) => { i.replied = true; calls.replies.push(x); return { resource: { message } }; },
    deferReply: async () => { i.deferred = true; },
    editReply: async (x) => { calls.edits.push(x); },
    followUp: async (x) => { calls.follow.push(x); },
    update: async (x) => { calls.edits.push(x); },
  };
  return i;
}

const text = (x) => (typeof x === 'string' ? x : x?.content ?? '');
const allText = (i) => [...i.calls.replies, ...i.calls.edits, ...i.calls.follow].map(text).join('\n');

module.exports = { SECRET, collection, fakeMember, fakeGuild, fakeTextChannel, fakeInteraction, text, allText };
