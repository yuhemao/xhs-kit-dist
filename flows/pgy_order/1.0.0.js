// 蒲公英（pgy.xiaohongshu.com）批量下单。Ported from pgy_order/main.py.
// Entries: preview (dry run + confirm code), submit (orders), allow_account.
// Settings namespace "pgy": allowed_accounts, previews, ledger.

const BASE = "https://pgy.xiaohongshu.com";
const HOME = `${BASE}/solar/pre-trade/home`;
const LOGIN_EXPIRED = -100;
const PREVIEW_DELAY_MS = 3000;
const ORDER_DELAY_MS = 10000;
const PREVIEW_TTL_MS = 24 * 3600 * 1000;
const COLLECTION_FLAG = { 单品笔记: 1, 合作笔记: 2 };
const MARKETING_TARGET = { 阅读: 1, 互动: 2, 曝光: 3 };
const ADS_AUDIT_TRUE = ["是", "需要", "需勾选", "true", "True", "1", "✅"];
const RESULT_HEADERS = [
  "序号", "名称", "链接", "合作形式", "原价（元）", "下单价(元)含平台服务费",
  "下单状态", "失败原因", "解析出的KOL ID", "临时单号", "订单号(taskNo)",
];

class LoginExpired extends Error {}

// ---------- template (txt) ----------

function parseTemplate(api, path) {
  const raw = {};
  for (let line of api.files.readText(path).split(/\r?\n/)) {
    line = line.trim();
    if (!line || line.startsWith("【")) continue;
    const m = line.match(/^([^：:]+)[：:](.*)$/);
    if (m) raw[m[1].trim()] = m[2].trim();
  }
  const g = (...keys) => keys.map((k) => raw[k] || "").find((v) => v) || "";
  const cfg = {
    title: g("合作名称"),
    reportBrandUserId: g("合作id"),
    contentDescription: g("品牌/产品介绍"),
    contactName: g("联系人"),
    contactPhone: g("联系电话"),
    contactWechat: g("微信号"),
    contentRequirement: g("合作要求"),
    spuId: g("SPU ID", "spu ID", "spu id", "spuid", "spuId"),
  };
  const need = {
    合作名称: cfg.title, 合作id: cfg.reportBrandUserId, "品牌/产品介绍": cfg.contentDescription,
    联系人: cfg.contactName, 联系电话: cfg.contactPhone, 合作要求: cfg.contentRequirement,
    期望保留时长: g("期望保留时长"), 合作笔记题材: g("合作笔记题材"), 营销目标: g("营销目标"),
  };
  const missing = Object.keys(need).filter((k) => !need[k]);
  if (missing.length) throw new Error(`下单模板缺少必填字段：${missing.join("、")}`);

  const days = g("期望保留时长").replace(/[^\d]/g, "");
  if (!days) throw new Error(`无法从「期望保留时长」解析出天数：${g("期望保留时长")}`);
  cfg.noteProtectDay = Number(days);
  cfg.collectionFlag = COLLECTION_FLAG[g("合作笔记题材")];
  if (!cfg.collectionFlag) throw new Error(`「合作笔记题材」只能填：${Object.keys(COLLECTION_FLAG).join("、")}`);
  cfg.marketingTarget = MARKETING_TARGET[g("营销目标")];
  if (!cfg.marketingTarget) throw new Error(`「营销目标」只能填：${Object.keys(MARKETING_TARGET).join("、")}`);
  const audit = g("是否勾选广审");
  cfg.needsAdsAudit = ADS_AUDIT_TRUE.includes(audit.trim()) || audit.includes("✅");
  return cfg;
}

// ---------- talent table (xlsx) ----------

const norm = (v) => (v == null ? "" : String(v)).replace(/[\s　]/g, "");
const blank = (v) => v == null || String(v).trim() === "";

function parseQuery(q) {
  const out = {};
  for (const part of (q || "").split("&")) {
    if (!part) continue;
    const i = part.indexOf("=");
    const k = i < 0 ? part : part.slice(0, i);
    const v = i < 0 ? "" : part.slice(i + 1);
    try { out[decodeURIComponent(k)] = decodeURIComponent(v.replace(/\+/g, " ")); } catch (e) { /* skip malformed */ }
  }
  return out;
}

function splitUrl(u) {
  const m = String(u).match(/^(https?):\/\/([^/?#]+)([^?#]*)(?:\?([^#]*))?/i);
  return m ? { host: m[2].toLowerCase(), path: m[3] || "/", query: m[4] || "" } : null;
}

const ID24 = /^\w{24}$/;
const PROFILE_PATTERNS = [
  /^https?:\/\/www\.xiaohongshu\.com\/user\/profile\/(\w+)/,
  /^https?:\/\/pgy\.xiaohongshu\.com\/solar\/pre-trade\/blogger-detail\/(\w+)/,
  /^https?:\/\/pgy\.xiaohongshu\.com\/solar\/blogger-detail\/(\w+)/,
];

function idFromUrl(url) {
  for (const p of PROFILE_PATTERNS) {
    const m = url.match(p);
    if (m && ID24.test(m[1])) return m[1];
  }
  return null;
}

function extractKolId(api, cell) {
  const found = String(cell).match(/https?:\/\/[^\s"'<>，。]+/);
  if (!found) return null;
  const url = found[0];
  const direct = idFromUrl(url);
  if (direct) return direct;
  if (!/xhslink\.(com|cn)/.test(url)) return null;

  let target = splitUrl(api.resolveUrl(url));
  if (!target || target.host !== "www.xiaohongshu.com") return null;
  // captcha and login-error pages carry the real destination in redirectPath
  if (target.path.includes("captcha") || target.path.includes("website-login/error")) {
    const redirect = parseQuery(target.query).redirectPath;
    target = redirect ? splitUrl(redirect) : null;
    if (!target) return null;
  }
  const profile = target.path.match(/^\/user\/profile\/(\w+)/);
  if (profile && ID24.test(profile[1])) return profile[1];
  const q = parseQuery(target.query);
  if (q.userId && ID24.test(q.userId)) return q.userId;
  if (q.originalUrl) return idFromUrl(q.originalUrl);
  return null;
}

function loadTalents(api, path) {
  const { rows } = api.files.readExcel(path);
  const headerAt = rows.slice(0, 30).findIndex((r) => {
    const h = r.map(norm);
    return h.some((v) => v.includes("链接")) && h.some((v) => v.startsWith("原价"));
  });
  if (headerAt < 0) throw new Error("表格前 30 行里找不到同时包含「链接」和「原价」的表头行");

  const col = {};
  rows[headerAt].map(norm).forEach((h, i) => {
    if (!h) return;
    if (h.includes("序号") && col.index === undefined) col.index = i;
    else if (h.includes("链接") && col.link === undefined) col.link = i;
    else if (h.startsWith("原价") && col.price === undefined) col.price = i;
    else if (h.startsWith("下单价") && col.total === undefined) col.total = i;
    else if (h.includes("合作形式") && col.form === undefined) col.form = i;
    else if (h === "名称" && col.name === undefined) col.name = i;
  });
  const missing = [["link", "链接"], ["form", "合作形式"], ["price", "原价"], ["total", "下单价"]]
    .filter(([k]) => col[k] === undefined).map(([, n]) => n);
  if (missing.length) throw new Error(`表头行（第 ${headerAt + 1} 行）缺少必需的列：${missing.join("、")}`);

  const talents = [];
  for (let r = headerAt + 1; r < rows.length; r++) {
    const v = rows[r];
    if (v.every(blank)) break; // table ends at the first blank row
    const cell = (k) => (col[k] === undefined ? null : v[col[k]]);
    const t = {
      row: r + 1,
      index: blank(cell("index")) ? String(talents.length + 1) : String(cell("index")).trim(),
      name: blank(cell("name")) ? "" : String(cell("name")).trim(),
      link: blank(cell("link")) ? "" : String(cell("link")).trim(),
      formText: blank(cell("form")) ? "" : String(cell("form")).trim(),
      error: "",
    };
    talents.push(t);
    const empty = [["link", "链接"], ["form", "合作形式"], ["price", "原价（元）"], ["total", "下单价(元)"]]
      .filter(([k]) => blank(cell(k))).map(([, n]) => n);
    if (empty.length) { t.error = `缺少必填字段：${empty.join("、")}`; continue; }
    t.contentType = t.formText.includes("视频") ? 2 : t.formText.includes("图文") ? 1 : 0;
    if (!t.contentType) { t.error = `无法识别「合作形式」是图文还是视频：${t.formText}`; continue; }
    t.price = Number(cell("price"));
    t.total = Number(cell("total"));
    if (!Number.isFinite(t.price) || !Number.isFinite(t.total)) {
      t.error = `原价或下单价不是有效数字（原价=${cell("price")}，下单价=${cell("total")}）`;
      continue;
    }
    try { t.kolId = extractKolId(api, t.link); } catch (e) { t.kolId = null; }
    if (!t.kolId) t.error = `无法从链接中解析出达人 ID：${t.link}`;
  }
  if (!talents.length) throw new Error("表格里没有任何达人数据行");
  const seen = new Set();
  for (const t of talents) {
    if (t.error) continue;
    if (seen.has(t.kolId)) t.error = "表格中该达人重复出现，已跳过";
    seen.add(t.kolId);
  }
  return talents;
}

// ---------- pgy API ----------

const cents = (x) => Math.round(Number(x) * 100);
const yuan = (c) => (c / 100).toFixed(2);

function call(api, path, { body, referrer, method } = {}) {
  const d = api.fetchJson(path, {
    method: method || (body === undefined ? "GET" : "POST"),
    body: body === undefined ? undefined : body,
    referrer: referrer || HOME,
  });
  if (d && d.code === LOGIN_EXPIRED) throw new LoginExpired(d.msg || "蒲公英登录已失效");
  return d;
}

function currentAccount(api) {
  api.open(HOME);
  const d = call(api, "/api/solar/user/info");
  const info = (d && d.data) || {};
  if (!d || !d.success || d.code !== 0 || !(info.userId || info.nickName)) {
    throw new LoginExpired("当前浏览器没有登录蒲公英，请先在 Chrome 里登录 pgy.xiaohongshu.com");
  }
  return { userId: String(info.userId), nickName: info.nickName || "", companyName: info.companyName || "" };
}

function balanceCents(api) {
  const d = call(api, "/api/solar/account/get_account", { referrer: `${BASE}/solar/infra_v2/advertiser/deals/balance` });
  if (!d || !d.success) throw new Error(`获取账号余额失败：${d && d.msg}`);
  return cents(d.data.totalBalance);
}

function checkout(api, cfg, t) {
  const temp = call(api, "/api/solar/cart/items/add_temp_item", {
    body: { kolUserId: t.kolId, settlementRule: 1, contentType: t.contentType, contentPrice: t.price, platform: 0 },
    referrer: `${BASE}/solar/pre-trade/note/kol`,
  });
  if (!temp.success) throw new Error(`创建临时订单项失败：${temp.msg}`);
  const tempItemId = temp.data;
  const referrer = `${BASE}/solar/transaction/proposal?type=new&tempItemId=${tempItemId}`;
  const p = call(api, "/api/solar/order/cart_checkout", {
    body: { bidType: 0, reportBrandUserId: cfg.reportBrandUserId, windmill: 0, scenesId: 1, tempItemId },
    referrer,
  });
  if (!p.success) throw new Error(`获取订单预览失败：${p.msg}`);
  const preview = p.data;
  let mismatch = "";
  if (preview.contentPrice != null && cents(preview.contentPrice) !== cents(t.price)) {
    mismatch = `原价和达人当前报价不一致，达人报价为 ${preview.contentPrice}`;
  } else if (preview.totalPrice != null && cents(preview.totalPrice) !== cents(t.total)) {
    mismatch = `下单价和总计金额不一致，总计金额为 ${preview.totalPrice}`;
  }
  return { tempItemId, referrer, preview, mismatch };
}

// Expected publish time: today by default (as the original script), or a
// caller-chosen day (YYYY-MM-DD) that must not be in the past.
function publishTime(dateText) {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  const today = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  if (!dateText) return `${today} 00:00:00`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText)) throw new Error(`期望发布日期格式应为 YYYY-MM-DD：${dateText}`);
  if (dateText < today) throw new Error(`期望发布日期不能早于今天（${today}）：${dateText}`);
  return `${dateText} 00:00:00`;
}

function packPayload(cfg, c, taskNo, reservation, publishAt) {
  const pv = c.preview;
  const payload = {
    contentType: -1, grantAds: false, orderComponent: null, test: false,
    reportBrandUserId: cfg.reportBrandUserId,
    contentPrice: pv.contentPrice, platformPrice: pv.platformPrice, totalPrice: pv.totalPrice,
    promotions: pv.promotions || [], discountPrice: pv.discountPrice || {},
    discountContentPrice: pv.discountContentPrice || "0.00",
    discountPlatformPrice: pv.discountPlatformPrice || "0.00",
    prepaymentPrice: pv.prepaymentPrice || "0.00", bidType: pv.bidType || 0,
    windmillPrice: pv.windmillPrice || "0.00", discountWindmillPrice: pv.discountWindmillPrice || "0.00",
    totalPlatformPrice: pv.totalPlatformPrice, recruitFirstOrder: pv.recruitFirstOrder || 0,
    minPricePercent: pv.minPricePercent, maxPricePercent: pv.maxPricePercent, priceRangeList: pv.priceRangeList,
    internal: false, isRecruit: false, orderType: "PROXY", taskNo,
    title: cfg.title, contentDescription: cfg.contentDescription,
    contactName: cfg.contactName, contactPhone: cfg.contactPhone, wechat: cfg.contactWechat,
    expectPublishTime: publishAt, needAdsAudit: cfg.needsAdsAudit, grantIntelligentTitle: cfg.needsAdsAudit,
    noteProtectDay: cfg.noteProtectDay, collectionFlag: cfg.collectionFlag, liveFlag: 0,
    contentRequirement: cfg.contentRequirement, attachments: "", contactWechat: cfg.contactWechat,
    useEngageComp: 0, componentGroup: {}, windmill: 0, hideBrandTag: 1, useSearchComp: 0, searchCompWord: "",
    tempItemId: c.tempItemId, collectionType: 1, intelligentCreative: 3,
    marketingTarget: cfg.marketingTarget, reservation: reservation ? 1 : 0,
  };
  if (reservation) payload.reservationDays = 365;
  if (cfg.spuId) payload.spuInfo = JSON.stringify([{ spuId: cfg.spuId, spuType: 1 }]);
  return payload;
}

// ---------- shared checks ----------

const ledgerKey = (cfg, t) => `${t.kolId}|${cfg.title}`;

function prepare(input, api) {
  const cfg = parseTemplate(api, input.template);
  const account = currentAccount(api);
  const allowed = api.settings.get("allowed_accounts") || [];
  if (!allowed.includes(account.userId)) return { cfg, account, notAllowed: true };
  const talents = loadTalents(api, input.table);
  const ledger = api.settings.get("ledger") || {};
  for (const t of talents) {
    const prior = !t.error && ledger[ledgerKey(cfg, t)];
    if (prior) {
      t.error = prior.status === "unknown"
        ? `上次下单结果未知（${prior.at}），请先在蒲公英后台核实是否已下单`
        : `该达人已按「${cfg.title}」下过单（订单号 ${prior.taskNo || "-"}，${prior.at}），已跳过`;
    }
  }
  const valid = talents.filter((t) => !t.error);
  const fingerprint = JSON.stringify({
    account: account.userId, cfg,
    rows: valid.map((t) => [t.kolId, t.contentType, cents(t.price), cents(t.total)]),
  });
  const code = api.sha256(fingerprint).slice(0, 8).toUpperCase();
  return { cfg, account, talents, valid, code };
}

function notAllowedReply(account) {
  return {
    status: "account_not_allowed",
    current_account: account,
    message: "当前 Chrome 里登录的蒲公英账号不在本机的允许下单名单中，没有做任何操作。" +
      "请把这个账号（昵称、公司、userId）告诉用户，确认它就是要下单的账号；" +
      "只有在用户明确同意后，才可以调用 pgy_account_allow 把它加入名单，然后重新预览。",
  };
}

function resultRows(talents) {
  return talents.map((t) => [
    t.index, t.name, t.link, { 1: "图文", 2: "视频" }[t.contentType] || t.formText,
    Number.isFinite(t.price) ? t.price : null, Number.isFinite(t.total) ? t.total : null,
    t.status || "失败", t.reason || t.error || "", t.kolId || "", t.tempItemId || "", t.taskNo || "",
  ]);
}

const stamp = () => new Date().toISOString().replace(/[-:]/g, "").slice(0, 15).replace("T", "-");

// ---------- entries ----------

function preview(input, api) {
  const p = prepare(input, api);
  if (p.notAllowed) return notAllowedReply(p.account);
  const { cfg, account, talents, valid, code } = p;
  const balance = balanceCents(api);
  const total = valid.reduce((s, t) => s + cents(t.total), 0);

  let loginLost = false;
  for (let i = 0; i < valid.length; i++) {
    const t = valid[i];
    api.progress({ stage: "预览核价", done: i, total: valid.length, current: t.name || t.kolId });
    if (loginLost) { t.status = "未处理"; t.reason = "蒲公英登录已失效"; continue; }
    try {
      const c = checkout(api, cfg, t);
      t.tempItemId = c.tempItemId;
      t.status = c.mismatch ? "失败" : "预览通过";
      t.reason = c.mismatch || `预览总金额 ${c.preview.totalPrice}`;
    } catch (e) {
      if (e instanceof LoginExpired) { loginLost = true; t.status = "失败"; t.reason = e.message; continue; }
      t.status = "失败"; t.reason = e.message;
    }
    if (i < valid.length - 1) api.sleep(PREVIEW_DELAY_MS);
  }

  const passed = valid.filter((t) => t.status === "预览通过");
  const file = api.files.writeExcel(`预览结果_${cfg.title}_${stamp()}`, RESULT_HEADERS, resultRows(talents));
  const ok = passed.length > 0 && passed.length === valid.length && !loginLost && balance >= total;
  if (ok) {
    const previews = api.settings.get("previews") || {};
    for (const k of Object.keys(previews)) if (Date.now() - previews[k].at > PREVIEW_TTL_MS) delete previews[k];
    previews[code] = { at: Date.now(), account: account.userId, rows: passed.length, total };
    api.settings.set("previews", previews);
  }
  return {
    status: ok ? "ready" : "not_ready",
    account, cooperation: cfg.title,
    rows: { total: talents.length, will_order: passed.length, skipped_or_failed: talents.length - passed.length },
    amount: { order_total_yuan: yuan(total), balance_yuan: yuan(balance), enough: balance >= total },
    problems: talents.filter((t) => t.status !== "预览通过").slice(0, 20)
      .map((t) => ({ row: t.index, name: t.name, reason: t.reason || t.error })),
    result_file: file,
    confirm_code: ok ? code : null,
    message: valid.length === 0
      ? "表格里没有需要下单的达人（都已下过单、结果待核实或数据有问题），没有生成确认码，也没有下任何订单。请把问题列表告诉用户。"
      : ok
      ? "预览通过，尚未下任何订单。请把账号、下单数量、总金额和余额告诉用户；用户明确确认下单后，调用 pgy_order_submit 并传入同样的文件和这个 confirm_code。confirm_code 24 小时内有效，表格或模板有任何改动都会失效。"
      : "预览未全部通过，没有生成确认码，也没有下任何订单。请把问题列表和结果文件告诉用户，修正表格或确认余额后重新预览。",
  };
}

function submit(input, api) {
  const p = prepare(input, api);
  if (p.notAllowed) return notAllowedReply(p.account);
  const { cfg, account, talents, valid, code } = p;
  const previews = api.settings.get("previews") || {};
  const granted = previews[input.confirm_code];
  if (!input.confirm_code || input.confirm_code !== code || !granted) {
    throw new Error("确认码无效：它不是由 pgy_order_preview 针对这份表格和模板生成的，或者表格、模板、登录账号在预览之后发生了变化。请重新预览并让用户确认。没有下任何订单。");
  }
  if (Date.now() - granted.at > PREVIEW_TTL_MS) throw new Error("确认码已超过 24 小时，请重新预览。没有下任何订单。");
  if (granted.account !== account.userId) throw new Error("登录账号和预览时不同，请重新预览。没有下任何订单。");
  const reservation = input.reservation === true;
  const publishAt = publishTime(input.publish_date);
  const total = valid.reduce((s, t) => s + cents(t.total), 0);
  if (balanceCents(api) < total) throw new Error("账号余额低于本次下单总金额，请先充值。没有下任何订单。");
  delete previews[input.confirm_code]; // single use
  api.settings.set("previews", previews);

  let loginLost = false;
  for (let i = 0; i < valid.length; i++) {
    const t = valid[i];
    api.progress({ stage: reservation ? "下预定单" : "下单", done: i, total: valid.length, current: t.name || t.kolId });
    if (loginLost) { t.status = "未处理"; t.reason = "蒲公英登录已失效，批量任务已中止"; continue; }
    const key = ledgerKey(cfg, t);
    try {
      const c = checkout(api, cfg, t);
      t.tempItemId = c.tempItemId;
      if (c.mismatch) { t.status = "失败"; t.reason = c.mismatch; continue; }
      const gen = call(api, "/api/solar/order/task_no/generate", { body: "", referrer: c.referrer, method: "POST" });
      if (!gen.success) throw new Error(`创建订单号失败：${gen.msg}`);
      t.taskNo = gen.data.taskNo;
      recordLedger(api, key, { status: "unknown", taskNo: t.taskNo, reservation });
      let d;
      try {
        d = call(api, "/api/solar/order/pack", { body: packPayload(cfg, c, t.taskNo, reservation, publishAt), referrer: c.referrer });
      } catch (e) {
        if (e instanceof LoginExpired) throw e;
        t.status = "状态未知";
        t.reason = `下单请求没有明确结果（${e.message}），请到蒲公英后台按订单号 ${t.taskNo} 核实`;
        continue;
      }
      if (d.success) {
        t.status = reservation ? "成功（预定单）" : "成功";
        recordLedger(api, key, { status: "success", taskNo: t.taskNo, reservation });
      } else {
        t.status = "失败"; t.reason = `下单失败：${d.msg}`;
        recordLedger(api, key, null);
      }
    } catch (e) {
      if (e instanceof LoginExpired) {
        loginLost = true;
        const ledger = api.settings.get("ledger") || {};
        if (ledger[key] && ledger[key].status === "unknown") { t.status = "状态未知"; t.reason = `登录失效时正在下单，请到后台核实订单号 ${t.taskNo}`; }
        else { t.status = "失败"; t.reason = e.message; }
        continue;
      }
      t.status = "失败"; t.reason = e.message;
    } finally {
      if (i < valid.length - 1 && !loginLost) api.sleep(ORDER_DELAY_MS);
    }
  }
  api.progress({ stage: "完成", done: valid.length, total: valid.length });

  const file = api.files.writeExcel(`下单结果_${cfg.title}_${stamp()}`, RESULT_HEADERS, resultRows(talents));
  const count = (s) => talents.filter((t) => t.status === s).length;
  return {
    status: "finished", account, cooperation: cfg.title, reservation,
    rows: {
      success: count(reservation ? "成功（预定单）" : "成功"), failed: count("失败"),
      unknown: count("状态未知"), not_processed: count("未处理") + talents.filter((t) => t.error).length,
    },
    unknown_orders: talents.filter((t) => t.status === "状态未知").map((t) => ({ name: t.name, taskNo: t.taskNo })),
    result_file: file,
    message: "下单已结束。请把成功、失败、状态未知的数量和结果文件告诉用户；状态未知的订单需要用户到蒲公英后台按订单号核实，确认前不会再次下单。",
  };
}

// QuickJS has no Intl, so format local time by hand.
function localTime() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function recordLedger(api, key, entry) {
  const ledger = api.settings.get("ledger") || {};
  if (entry) ledger[key] = Object.assign({ at: localTime() }, entry);
  else delete ledger[key];
  api.settings.set("ledger", ledger);
}

function allow_account(input, api) {
  const account = currentAccount(api);
  if (String(input.user_id || "") !== account.userId) {
    throw new Error(`只能把当前 Chrome 里登录的账号加入名单。当前登录的是「${account.nickName}」（userId ${account.userId}）。`);
  }
  const allowed = api.settings.get("allowed_accounts") || [];
  if (!allowed.includes(account.userId)) allowed.push(account.userId);
  api.settings.set("allowed_accounts", allowed);
  return { status: "allowed", account, allowed_accounts: allowed };
}
