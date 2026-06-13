import { NextResponse } from "next/server";

type EkispertPoint = {
  Prefecture?: {
    code?: string;
    Name?: string;
  };
  Station?: {
    code?: string;
    Name?: string;
    Yomi?: string;
    Type?: string | { text?: string; detail?: string };
  };
};

type EkispertResponse = {
  ResultSet?: {
    Point?: EkispertPoint | EkispertPoint[];
    Error?: {
      Message?: string;
    };
  };
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim() ?? "";
  const key = process.env.EKISPERT_API_KEY;

  if (!query || query.length < 1) {
    return NextResponse.json({ stations: [] });
  }

  if (!key) {
    return NextResponse.json({ stations: [], source: "local-fallback", reason: "missing-key" });
  }

  const params = new URLSearchParams({
    key,
    name: query.replace(/駅$/u, ""),
    nameMatchType: "partial",
    type: "train",
    prefectureCode: "13:11:12:14"
  });

  const endpoint = `https://api.ekispert.jp/v1/json/station/light?${params.toString()}`;

  try {
    const response = await fetch(endpoint, {
      headers: {
        Accept: "application/json"
      },
      next: {
        revalidate: 60 * 60 * 24
      }
    });

    if (!response.ok) {
      return NextResponse.json(
        { stations: [], source: "local-fallback", reason: `ekispert-${response.status}` },
        { status: 200 }
      );
    }

    const data = (await response.json()) as EkispertResponse;
    const points = Array.isArray(data.ResultSet?.Point)
      ? data.ResultSet?.Point
      : data.ResultSet?.Point
        ? [data.ResultSet.Point]
        : [];

    const seen = new Set<string>();
    const stations = points
      .map((point) => ({
        code: point.Station?.code ?? "",
        name: point.Station?.Name ?? "",
        yomi: point.Station?.Yomi ?? "",
        prefecture: point.Prefecture?.Name ?? "",
        prefectureCode: point.Prefecture?.code ?? ""
      }))
      .filter((station) => station.name)
      .filter((station) => {
        if (seen.has(station.name)) return false;
        seen.add(station.name);
        return true;
      })
      .slice(0, 12);

    return NextResponse.json({ stations, source: "ekispert" });
  } catch {
    return NextResponse.json({ stations: [], source: "local-fallback", reason: "fetch-failed" });
  }
}
