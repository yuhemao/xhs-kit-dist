function run(input, api) {
  api.open("https://pgy.xiaohongshu.com/solar/pre-trade/home");
  const d = api.fetchJson("/api/solar/user/info");
  if (d.code !== 0) throw new Error(`蒲公英接口返回异常: code=${d.code} msg=${d.msg}`);
  return { nickName: d.data.nickName, userId: d.data.userId, companyName: d.data.companyName };
}
