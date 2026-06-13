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

type ParsedLeg = {
  from: string;
  to: string;
  lineName: string;
  lineSymbol: string;
  lineColor: string;
  duration: number;
  departureTime?: string;
  arrivalTime?: string;
  isWalk?: boolean;
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
        lines: [],
        legs: [],
        transferCount: 0
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
    sort: searchParams.get("sort") ?? "transfer",
    answerCount: "3",
    searchCount: "5",
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
    const course = chooseCourse(courses);
    const route = course?.Route;

    if (!route) {
      return NextResponse.json({ route: null, source: "local-fallback", reason: "no-route" });
    }

    const path = extractPath(route.Point);
    const lines = extractLines(route.Line);
    const legs = extractLegs(route.Point, route.Line);
    const duration =
      toNumber(route.timeOnBoard) + toNumber(route.timeOther) + toNumber(route.timeWalk);

    return NextResponse.json({
      route: {
        duration,
        path: path.length > 0 ? path : [from, to],
        lines,
        legs,
        transferCount: toNumber(route.transferCount)
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

function chooseCourse(courses: EkispertCourse[]) {
  return courses
    .slice()
    .sort((a, b) => {
      const routeA = a.Route;
      const routeB = b.Route;
      const transfers = toNumber(routeA?.transferCount) - toNumber(routeB?.transferCount);
      if (transfers !== 0) return transfers;
      return routeDuration(routeA) - routeDuration(routeB);
    })[0];
}

function routeDuration(route?: EkispertCourse["Route"]) {
  return toNumber(route?.timeOnBoard) + toNumber(route?.timeOther) + toNumber(route?.timeWalk);
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

function extractLegs(points: unknown, lines: unknown): ParsedLeg[] {
  const pointList = asArray(points as Array<{ Station?: { Name?: string }; Name?: string }>);
  const lineList = asArray(
    lines as Array<{
      Name?: string;
      Color?: string;
      LineSymbol?: { Name?: string };
      timeOnBoard?: string;
      timeWalk?: string;
      DepartureState?: { Datetime?: { text?: string } };
      ArrivalState?: { Datetime?: { text?: string } };
    }>
  );

  return lineList
    .map((line, index) => {
      const from = pointList[index]?.Station?.Name ?? pointList[index]?.Name ?? "";
      const to = pointList[index + 1]?.Station?.Name ?? pointList[index + 1]?.Name ?? "";
      const lineName = line.Name ?? "移動";
      return {
        from,
        to,
        lineName,
        lineSymbol: line.LineSymbol?.Name ?? "",
        lineColor: normalizeColor(line.Color),
        duration: toNumber(line.timeOnBoard) + toNumber(line.timeWalk),
        departureTime: formatEkispertDateTime(line.DepartureState?.Datetime?.text),
        arrivalTime: formatEkispertDateTime(line.ArrivalState?.Datetime?.text),
        isWalk: lineName.includes("徒歩")
      };
    })
    .filter((leg) => leg.from && leg.to);
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

function formatEkispertDateTime(value?: string) {
  if (!value) return undefined;
  const match = value.match(/T(\d{2}):?(\d{2})/);
  if (!match) return undefined;
  return `${match[1]}:${match[2]}`;
}

function formatToday() {
  const now = new Date();
  return `${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, "0")}${now
    .getDate()
    .toString()
    .padStart(2, "0")}`;
}
