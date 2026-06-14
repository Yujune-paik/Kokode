import assert from "node:assert/strict";
import test from "node:test";

const largeTerminalStations = ["大手町", "池袋", "新宿", "渋谷", "東京"];

function normalizeStation(value) {
  return value.trim().toLocaleLowerCase("ja-JP").replace(/駅$/u, "");
}

function isLargeTerminalStation(station) {
  return largeTerminalStations.some((terminal) => normalizeStation(terminal) === normalizeStation(station));
}

function directionPenalty(candidate, directRoutes, routeDurations, onwardDuration) {
  const penalties = directRoutes.map((directRoute) => {
    const directPath = directRoute.path.map(normalizeStation);
    const index = directPath.indexOf(normalizeStation(candidate));
    const combinedDuration = routeDurations[directRoute.person] + onwardDuration;
    const detour = Math.max(0, combinedDuration - directRoute.duration);

    if (index >= 0) {
      const progress = index / Math.max(1, directPath.length - 1);
      const nearDestinationBonus = progress >= 0.65 ? -8 : progress >= 0.45 ? -4 : 0;
      return Math.max(-10, detour * 0.4 + nearDestinationBonus);
    }

    return 18 + detour * 1.5;
  });

  const average = penalties.reduce((sum, penalty) => sum + penalty, 0) / penalties.length;
  const isOnAllRoutes = directRoutes.every((route) =>
    route.path.map(normalizeStation).includes(normalizeStation(candidate))
  );

  return isOnAllRoutes ? average - 6 : average + 18;
}

function candidateScore(candidate, directRoutes, routeDurations, onwardDuration, onwardTransfers = 0) {
  const destinationDirectionScore = directionPenalty(candidate, directRoutes, routeDurations, onwardDuration);
  const afterMeetingTogetherScore = onwardTransfers * 8 + (onwardDuration <= 12 ? -6 : 0);
  const stationSimplicityScore = isLargeTerminalStation(candidate) ? 12 : 0;

  return destinationDirectionScore * 0.2 + afterMeetingTogetherScore * 0.15 + stationSimplicityScore * 0.1;
}

test("東大前・外苑前から練馬高野台へ向かう場合、大手町を上位にしない", () => {
  const directRoutes = [
    {
      person: "自分",
      duration: 31,
      path: ["東大前", "飯田橋", "小竹向原", "練馬", "練馬高野台"]
    },
    {
      person: "相手",
      duration: 36,
      path: ["外苑前", "永田町", "飯田橋", "小竹向原", "練馬", "練馬高野台"]
    }
  ];

  const candidates = [
    {
      station: "大手町",
      routeDurations: { 自分: 12, 相手: 16 },
      onwardDuration: 34,
      onwardTransfers: 2
    },
    {
      station: "飯田橋",
      routeDurations: { 自分: 6, 相手: 15 },
      onwardDuration: 25,
      onwardTransfers: 1
    },
    {
      station: "小竹向原",
      routeDurations: { 自分: 18, 相手: 24 },
      onwardDuration: 13,
      onwardTransfers: 0
    },
    {
      station: "練馬",
      routeDurations: { 自分: 27, 相手: 31 },
      onwardDuration: 4,
      onwardTransfers: 0
    }
  ];

  const ranked = candidates
    .map((candidate) => ({
      station: candidate.station,
      score: candidateScore(
        candidate.station,
        directRoutes,
        candidate.routeDurations,
        candidate.onwardDuration,
        candidate.onwardTransfers
      )
    }))
    .sort((a, b) => a.score - b.score);

  assert.notEqual(ranked[0].station, "大手町");
  assert.ok(["練馬", "小竹向原", "飯田橋"].includes(ranked[0].station));
  assert.ok(ranked.findIndex((candidate) => candidate.station === "大手町") > 0);
});
