import { NextResponse } from "next/server";

type EkispertCourse = {
  Route?: {
    timeOnBoard?: string;
    timeOther?: string;
    timeWalk?: string;
    transferCount?: string;
    Point?: unknown;
    Line?: unknown;
  };
};

type EkispertRouteResponse = {
  ResultSet?: {
    Course?: EkispertCourse | EkispertCourse[];
    Error?: {
      Message?: string;
    };
  };
};

type ParsedLine = {
  name: string;
  symbol: string;
  color: string;
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from")?.trim() ?? "";
  const to = searchParams.get("to")?.trim() ?? "";
  const time = searchParams.get("time")?.replace(":", "") ?? "";
  const key = process.env.EKISPERT_API_KEY;

  if (!from || !to) {
    return NextResponse.json({ route: null, source: "local-fallback", reason: "missing-station" });
  }

  if (from === to) {
    return NextResponse.json({
      route: {
        duration: 0,
        path: [from],
        lines: []
      },
      source: "ekispert"
    });
  }

  if (!key) {
    return NextResponse.json({ route: null, source: "local-fallback", reason: "missing-key" });
  }

  const params = new URLSearchParams({
    key,
    viaList: `${from}:${to}`,
    searchType: process.env.EKISPERT_SEARCH_TYPE ?? "departure",
    sort: "time",
    answerCount: "1",
    searchCount: "1",
    plane: "false",
    shinkansen: "false",
    limitedExpress: "false"
  });

  if (time) params.set("time", time);
  params.set("date", formatToday());

  const endpoint = `https://api.ekispert.jp/v1/json/search/course/extreme?${params.toString()}`;

  try {
    const response = await fetch(endpoint, {
      headers: {
        Accept: "application/json"
      },
      next: {
        revalidate: 60 * 60
      }
    });

    if (!response.ok) {
      return NextResponse.json(
        { route: null, source: "local-fallback", reason: `ekispert-${response.status}` },
        { status: 200 }
      );
    }

    const data = (await response.json()) as EkispertRouteResponse;
    const courses = asArray(data.ResultSet?.Course);
    const course = courses[0];
    const route = course?.Route;

    if (!route) {
      return NextResponse.json({ route: null, source: "local-fallback", reason: "no-route" });
    }

    const path = extractPath(route.Point);
    const lines = extractLines(route.Line);
    const duration =
      toNumber(route.timeOnBoard) + toNumber(route.timeOther) + toNumber(route.timeWalk);

    return NextResponse.json({
      route: {
        duration,
        path: path.length > 0 ? path : [from, to],
        lines
      },
      source: "ekispert"
    });
  } catch {
    return NextResponse.json({ route: null, source: "local-fallback", reason: "fetch-failed" });
  }
}

function asArray<T>(value: T | T[] | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function extractPath(points: unknown) {
  return asArray(points as Array<{ Station?: { Name?: string }; Name?: string }>)
    .map((point) => point.Station?.Name ?? point.Name ?? "")
    .filter(Boolean);
}

function extractLines(lines: unknown): ParsedLine[] {
  return asArray(
    lines as Array<{
      Name?: string;
      Color?: string;
      LineSymbol?: { Name?: string };
    }>
  )
    .map((line) => ({
      name: line.Name ?? "路線",
      symbol: line.LineSymbol?.Name ?? "",
      color: normalizeColor(line.Color)
    }))
    .filter((line) => line.name);
}

function normalizeColor(value?: string) {
  if (!value) return "#66726D";
  const numeric = Number(value);
  if (Number.isNaN(numeric)) return "#66726D";
  const hex = numeric.toString(16).padStart(6, "0").slice(-6);
  return `#${hex}`;
}

function toNumber(value?: string) {
  const parsed = Number.parseInt(value ?? "0", 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function formatToday() {
  const now = new Date();
  return `${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, "0")}${now
    .getDate()
    .toString()
    .padStart(2, "0")}`;
}
