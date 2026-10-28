// Existing gameplay tests explicitly opt out of heroes after the new draft phase.
export async function startWithoutHero(jsonRequest, url, options, sessions) {
  let ack = await jsonRequest(url, options);
  const credentials = JSON.parse(options.body);
  const roomUrl = url.slice(0, -"/start".length);
  let state = await jsonRequest(`${roomUrl}/state?${new URLSearchParams(credentials)}`);
  if (state.stage !== "hero-selecting") return ack;
  for (const player of state.players.filter((item) => !item.test)) {
    const session = sessions.get(player.id);
    if (!session) throw new Error(`缺少选将测试身份 ${player.id}`);
    ack = await jsonRequest(`${roomUrl}/hero-select`, {
      method: "POST", body: JSON.stringify({ playerId: player.id, token: session.token, heroId: null })
    });
  }
  return ack;
}
