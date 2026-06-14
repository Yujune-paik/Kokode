"use client";

import {
  Copy,
  MapPin,
  Plus,
  Search,
  Share2,
  Trash2
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

type Priority = "balanced" | "fast" | "fair";

type Person = {
  id: string;
  name: string;
  origin: string;
};

type StationSuggestion = {
  name: string;
  yomi?: string;
  prefecture?: string;
  source: "local" | "ekispert";
};

type AppState = {
  destination: string;
  departureTime: string;
  priority: Priority;
  people: Person[];
};

type RouteResult = {
  person: Person;
  duration: number;
  arrivalTime: number;
  path: string[];
  lines: LineMeta[];
  legs: RouteLeg[];
  transferCount: number;
};

type Candidate = {
  station: string;
  isDirectDestination: boolean;
  gatherTime: number;
  destinationTime: number;
  onwardDuration: number;
  onwardPath: string[];
  onwardLines: LineMeta[];
  onwardLegs: RouteLeg[];
  waitingTotal: number;
  transferTotal: number;
  score: number;
  routes: RouteResult[];
  directRoutes?: RouteResult[];
  reasons: string[];
};

type LineMeta = {
  operator: string;
  name: string;
  symbol: string;
  color: string;
};

type RouteLeg = {
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

type EkispertRoute = {
  duration: number;
  path: string[];
  transferCount: number;
  legs: RouteLeg[];
  lines: Array<{
    name: string;
    symbol: string;
    color: string;
  }>;
};

type EdgeTuple = [string, string, number, LineMeta];

type GraphEdge = {
  station: string;
  minutes: number;
  line: LineMeta;
};

type DijkstraResult = {
  distances: Map<string, number>;
  previous: Map<string, string>;
};

type LineTextMessage = {
  type: "text";
  text: string;
};

type LineFlexMessage = {
  type: "flex";
  altText: string;
  contents: Record<string, unknown>;
};

type LineMessage = LineTextMessage | LineFlexMessage;

type LiffLike = {
  init: (options: { liffId: string }) => Promise<void>;
  isInClient: () => boolean;
  isLoggedIn: () => boolean;
  login: (options?: { redirectUri?: string }) => void;
  isApiAvailable: (apiName: string) => boolean;
  shareTargetPicker: (
    messages: LineMessage[],
    options?: { isMultiple?: boolean }
  ) => Promise<unknown>;
};

const PRIORITY_LABELS: Record<Priority, string> = {
  balanced: "乗換少なめ",
  fast: "目的地に早く着く",
  fair: "待ち時間少なめ"
};

const DEFAULT_STATE: AppState = {
  destination: "",
  departureTime: "",
  priority: "balanced",
  people: [
    { id: "p1", name: "あなた", origin: "" },
    { id: "p2", name: "お相手", origin: "" }
  ]
};

const EKISPERT_MEETUP_CANDIDATE_LIMIT = 5;

const TRANSFER_LINE: LineMeta = {
  operator: "徒歩/連絡",
  name: "駅間連絡",
  symbol: "↔",
  color: "#66726D"
};

const lineMeta = (operator: string, name: string, symbol: string, color: string): LineMeta => ({
  operator,
  name,
  symbol,
  color
});

const DIRECT_EDGES: Array<[string, string, number]> = [
  ["ひばりヶ丘", "池袋", 18],
  ["ひばりヶ丘", "小竹向原", 21],
  ["小竹向原", "新宿三丁目", 13],
  ["小竹向原", "池袋", 8],
  ["新宿三丁目", "新宿", 2],
  ["新宿三丁目", "渋谷", 7],
  ["渋谷", "表参道", 2],
  ["表参道", "大手町", 15],
  ["大手町", "東京", 2],
  ["中目黒", "渋谷", 4],
  ["中目黒", "六本木", 9],
  ["六本木", "大手町", 13],
  ["北千住", "上野", 10],
  ["北千住", "大手町", 18],
  ["舞浜", "東京", 16],
  ["舞浜", "新木場", 6],
  ["新木場", "渋谷", 24],
  ["自由が丘", "渋谷", 10],
  ["自由が丘", "横浜", 21],
  ["横浜", "渋谷", 25],
  ["横浜", "品川", 17],
  ["品川", "東京", 8],
  ["浦和", "池袋", 20],
  ["浦和", "上野", 22],
  ["立川", "新宿", 27],
  ["立川", "吉祥寺", 16],
  ["吉祥寺", "渋谷", 18]
];

const LINE_NETWORKS: Array<{ line: LineMeta; stations: string[]; minutes: number }> = [
  {
    line: lineMeta("JR", "山手線", "JY", "#9ACD32"),
    minutes: 3,
    stations: [
      "東京",
      "神田",
      "秋葉原",
      "御徒町",
      "上野",
      "鶯谷",
      "日暮里",
      "西日暮里",
      "田端",
      "駒込",
      "巣鴨",
      "大塚",
      "池袋",
      "目白",
      "高田馬場",
      "新大久保",
      "新宿",
      "代々木",
      "原宿",
      "渋谷",
      "恵比寿",
      "目黒",
      "五反田",
      "大崎",
      "品川",
      "高輪ゲートウェイ",
      "田町",
      "浜松町",
      "新橋",
      "有楽町",
      "東京"
    ]
  },
  {
    line: lineMeta("JR", "中央線", "JC", "#F15A24"),
    minutes: 4,
    stations: [
      "東京",
      "四ツ谷",
      "新宿",
      "中野",
      "荻窪",
      "吉祥寺",
      "三鷹",
      "国分寺",
      "立川",
      "八王子",
      "高尾"
    ]
  },
  {
    line: lineMeta("JR", "埼京線", "JA", "#00A040"),
    minutes: 4,
    stations: ["大崎", "恵比寿", "渋谷", "新宿", "池袋", "赤羽", "武蔵浦和", "大宮", "川越"]
  },
  {
    line: lineMeta("JR", "京浜東北線", "JK", "#00B2E5"),
    minutes: 4,
    stations: ["上野", "赤羽", "浦和", "さいたま新都心", "大宮"]
  },
  {
    line: lineMeta("JR", "上野東京ライン", "JU", "#F68B1F"),
    minutes: 4,
    stations: ["大宮", "浦和", "赤羽", "上野", "東京", "新橋", "品川", "川崎", "横浜", "桜木町"]
  },
  {
    line: lineMeta("JR", "東海道線", "JT", "#F68B1F"),
    minutes: 4,
    stations: ["東京", "新橋", "品川", "川崎", "横浜", "戸塚", "大船", "藤沢", "辻堂", "茅ケ崎"]
  },
  {
    line: lineMeta("JR", "京葉線", "JE", "#C9242F"),
    minutes: 4,
    stations: ["東京", "八丁堀", "新木場", "舞浜", "新浦安", "海浜幕張", "蘇我"]
  },
  {
    line: lineMeta("東急", "東横線", "TY", "#DA0442"),
    minutes: 4,
    stations: ["渋谷", "中目黒", "自由が丘", "武蔵小杉", "日吉", "菊名", "横浜"]
  },
  {
    line: lineMeta("西武", "池袋線", "SI", "#F5A200"),
    minutes: 3,
    stations: [
      "池袋",
      "椎名町",
      "東長崎",
      "江古田",
      "桜台",
      "練馬",
      "中村橋",
      "富士見台",
      "練馬高野台",
      "石神井公園",
      "大泉学園",
      "保谷",
      "ひばりヶ丘",
      "東久留米",
      "清瀬",
      "秋津",
      "所沢",
      "西所沢",
      "小手指",
      "入間市",
      "飯能"
    ]
  },
  {
    line: lineMeta("小田急", "小田原線", "OH", "#0085CE"),
    minutes: 7,
    stations: ["新宿", "下北沢", "登戸", "新百合ヶ丘", "町田", "相模大野", "海老名"]
  },
  {
    line: lineMeta("京王", "井の頭線", "IN", "#004EA2"),
    minutes: 6,
    stations: ["渋谷", "下北沢", "明大前", "吉祥寺"]
  },
  {
    line: lineMeta("京王", "京王線", "KO", "#DD0077"),
    minutes: 5,
    stations: ["新宿", "明大前", "調布", "府中", "分倍河原", "橋本"]
  },
  {
    line: lineMeta("東京メトロ", "丸ノ内線", "M", "#F62E36"),
    minutes: 3,
    stations: [
      "池袋",
      "新大塚",
      "茗荷谷",
      "後楽園",
      "大手町",
      "東京",
      "銀座",
      "霞ケ関",
      "赤坂見附",
      "四ツ谷",
      "新宿三丁目",
      "新宿",
      "中野坂上",
      "荻窪"
    ]
  },
  {
    line: lineMeta("東京メトロ", "銀座線", "G", "#FF9500"),
    minutes: 3,
    stations: [
      "浅草",
      "田原町",
      "稲荷町",
      "上野",
      "上野広小路",
      "末広町",
      "神田",
      "三越前",
      "日本橋",
      "京橋",
      "銀座",
      "新橋",
      "虎ノ門",
      "溜池山王",
      "赤坂見附",
      "青山一丁目",
      "外苑前",
      "表参道",
      "渋谷"
    ]
  },
  {
    line: lineMeta("東京メトロ", "日比谷線", "H", "#B5B5AC"),
    minutes: 3,
    stations: ["中目黒", "恵比寿", "六本木", "霞ケ関", "銀座", "秋葉原", "上野", "北千住"]
  },
  {
    line: lineMeta("東京メトロ", "千代田線", "C", "#00BB85"),
    minutes: 3,
    stations: ["代々木上原", "表参道", "赤坂", "霞ケ関", "日比谷", "大手町", "西日暮里", "北千住"]
  },
  {
    line: lineMeta("東京メトロ", "南北線", "N", "#00AC9B"),
    minutes: 3,
    stations: [
      "目黒",
      "白金台",
      "白金高輪",
      "麻布十番",
      "六本木一丁目",
      "溜池山王",
      "永田町",
      "四ツ谷",
      "市ケ谷",
      "飯田橋",
      "後楽園",
      "東大前",
      "本駒込",
      "駒込",
      "西ケ原",
      "王子",
      "赤羽岩淵"
    ]
  },
  {
    line: lineMeta("東京メトロ", "有楽町線", "Y", "#C1A470"),
    minutes: 3,
    stations: ["和光市", "小竹向原", "池袋", "飯田橋", "有楽町", "豊洲", "新木場"]
  },
  {
    line: lineMeta("東京メトロ", "半蔵門線", "Z", "#8F76D6"),
    minutes: 3,
    stations: ["押上", "錦糸町", "住吉", "清澄白河", "大手町", "永田町", "青山一丁目", "渋谷"]
  },
  {
    line: lineMeta("東京メトロ", "南北線", "N", "#00AC9B"),
    minutes: 3,
    stations: [
      "目黒",
      "白金台",
      "白金高輪",
      "麻布十番",
      "六本木一丁目",
      "溜池山王",
      "永田町",
      "四ツ谷",
      "市ケ谷",
      "飯田橋",
      "後楽園",
      "東大前",
      "本駒込",
      "駒込",
      "西ケ原",
      "王子",
      "赤羽岩淵"
    ]
  },
  {
    line: lineMeta("東京メトロ", "東西線", "T", "#009BBF"),
    minutes: 3,
    stations: [
      "中野",
      "落合",
      "高田馬場",
      "早稲田",
      "神楽坂",
      "飯田橋",
      "九段下",
      "竹橋",
      "大手町",
      "日本橋",
      "茅場町",
      "門前仲町",
      "木場",
      "東陽町",
      "南砂町",
      "西葛西",
      "葛西",
      "浦安"
    ]
  },
  {
    line: lineMeta("東京メトロ", "副都心線", "F", "#9C5E31"),
    minutes: 3,
    stations: [
      "和光市",
      "地下鉄成増",
      "地下鉄赤塚",
      "平和台",
      "氷川台",
      "小竹向原",
      "千川",
      "要町",
      "池袋",
      "雑司が谷",
      "西早稲田",
      "東新宿",
      "新宿三丁目",
      "北参道",
      "明治神宮前",
      "渋谷"
    ]
  },
  {
    line: lineMeta("都営", "浅草線", "A", "#E85298"),
    minutes: 3,
    stations: [
      "西馬込",
      "馬込",
      "中延",
      "戸越",
      "五反田",
      "高輪台",
      "泉岳寺",
      "三田",
      "大門",
      "新橋",
      "東銀座",
      "宝町",
      "日本橋",
      "人形町",
      "東日本橋",
      "浅草橋",
      "蔵前",
      "浅草",
      "本所吾妻橋",
      "押上"
    ]
  },
  {
    line: lineMeta("都営", "三田線", "I", "#0079C2"),
    minutes: 3,
    stations: [
      "目黒",
      "白金台",
      "白金高輪",
      "三田",
      "芝公園",
      "御成門",
      "内幸町",
      "日比谷",
      "大手町",
      "神保町",
      "水道橋",
      "春日",
      "白山",
      "千石",
      "巣鴨",
      "西巣鴨",
      "新板橋",
      "板橋区役所前",
      "板橋本町",
      "本蓮沼",
      "志村坂上",
      "志村三丁目",
      "蓮根",
      "西台",
      "高島平",
      "西高島平"
    ]
  },
  {
    line: lineMeta("都営", "新宿線", "S", "#6CBB5A"),
    minutes: 3,
    stations: [
      "新宿",
      "新宿三丁目",
      "曙橋",
      "市ケ谷",
      "九段下",
      "神保町",
      "小川町",
      "岩本町",
      "馬喰横山",
      "浜町",
      "森下",
      "菊川",
      "住吉",
      "西大島",
      "大島",
      "東大島",
      "船堀",
      "一之江",
      "瑞江",
      "篠崎",
      "本八幡"
    ]
  },
  {
    line: lineMeta("都営", "大江戸線", "E", "#B6007A"),
    minutes: 3,
    stations: [
      "都庁前",
      "新宿西口",
      "東新宿",
      "若松河田",
      "牛込柳町",
      "牛込神楽坂",
      "飯田橋",
      "春日",
      "本郷三丁目",
      "上野御徒町",
      "新御徒町",
      "蔵前",
      "両国",
      "森下",
      "清澄白河",
      "門前仲町",
      "月島",
      "勝どき",
      "築地市場",
      "汐留",
      "大門",
      "赤羽橋",
      "麻布十番",
      "六本木",
      "青山一丁目",
      "国立競技場",
      "代々木",
      "新宿",
      "都庁前",
      "西新宿五丁目",
      "中野坂上",
      "東中野",
      "中井",
      "落合南長崎",
      "新江古田",
      "練馬",
      "豊島園",
      "練馬春日町",
      "光が丘"
    ]
  },
  {
    line: lineMeta("JR", "中央・総武線", "JB", "#FFD400"),
    minutes: 3,
    stations: [
      "三鷹",
      "吉祥寺",
      "西荻窪",
      "荻窪",
      "阿佐ケ谷",
      "高円寺",
      "中野",
      "東中野",
      "大久保",
      "新宿",
      "代々木",
      "千駄ケ谷",
      "信濃町",
      "四ツ谷",
      "市ケ谷",
      "飯田橋",
      "水道橋",
      "御茶ノ水",
      "秋葉原",
      "浅草橋",
      "両国",
      "錦糸町",
      "亀戸",
      "平井",
      "新小岩",
      "小岩"
    ]
  }
];

const EDGES: EdgeTuple[] = [
  ...DIRECT_EDGES.map(([from, to, minutes]) => [from, to, minutes, TRANSFER_LINE] as EdgeTuple),
  ...LINE_NETWORKS.flatMap(({ stations, minutes, line }) => toEdges(stations, minutes, line))
];
const graph = buildGraph(EDGES);
const stationNames = Array.from(graph.keys()).sort((a, b) => a.localeCompare(b, "ja"));
const majorHubStations = [
  "東京",
  "新宿",
  "渋谷",
  "池袋",
  "上野",
  "品川",
  "大手町",
  "銀座",
  "表参道",
  "六本木",
  "飯田橋",
  "秋葉原",
  "横浜",
  "大宮",
  "北千住"
];
const largeTerminalStations = ["大手町", "池袋", "新宿", "渋谷", "東京"];

export function MeetupPlanner() {
  const [destination, setDestination] = useState(DEFAULT_STATE.destination);
  const [departureTime, setDepartureTime] = useState(DEFAULT_STATE.departureTime);
  const [currentClock, setCurrentClock] = useState("");
  const [priority, setPriority] = useState<Priority>(DEFAULT_STATE.priority);
  const [people, setPeople] = useState<Person[]>(DEFAULT_STATE.people);
  const [hasSearched, setHasSearched] = useState(false);
  const [toast, setToast] = useState("");
  const [refinedCandidates, setRefinedCandidates] = useState<Candidate[]>([]);
  const [isRefiningRoutes, setIsRefiningRoutes] = useState(false);
  const [liffClient, setLiffClient] = useState<LiffLike | null>(null);
  const resultsRef = useRef<HTMLElement | null>(null);

  const appState = useMemo<AppState>(
    () => ({ destination, departureTime, priority, people }),
    [destination, departureTime, people, priority]
  );

  useEffect(() => {
    const restored = restoreStateFromUrl();
    if (restored) {
      setDestination(restored.destination);
      setDepartureTime(restored.departureTime);
      setPriority(restored.priority);
      setPeople(restored.people);
      setHasSearched(true);
    } else {
      setDepartureTime(getCurrentClock());
    }
  }, []);

  useEffect(() => {
    function syncClock() {
      setCurrentClock(getCurrentClock());
    }

    syncClock();
    const timer = window.setInterval(syncClock, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
    if (!liffId) {
      return;
    }

    const effectiveLiffId = liffId;
    let cancelled = false;

    async function initializeLiff() {
      try {
        const module = await import("@line/liff");
        const liff = module.default as LiffLike;
        await liff.init({ liffId: effectiveLiffId });
        if (!cancelled) {
          setLiffClient(liff);
        }
      } catch {
        // LIFFが初期化できない場合も通常のWebアプリとして動かす。
      }
    }

    initializeLiff();

    return () => {
      cancelled = true;
    };
  }, []);

  const validationMessage = validateState(appState);
  const baseCandidates = useMemo(
    () => (hasSearched && !validationMessage ? calculateCandidates(appState).slice(0, 5) : []),
    [appState, hasSearched, validationMessage]
  );
  const candidates = refinedCandidates.length > 0 ? refinedCandidates : baseCandidates;

  useEffect(() => {
    let cancelled = false;

    async function refineRoutes() {
      if (!hasSearched || validationMessage || baseCandidates.length === 0) {
        setRefinedCandidates([]);
        return;
      }

      setRefinedCandidates(baseCandidates);
      setIsRefiningRoutes(true);

      try {
        const ekispertSeeds = await buildEkispertCandidateSeeds(baseCandidates, appState);
        const candidateSeeds = ekispertSeeds ?? calculateFallbackCandidates(appState).slice(0, 5);
        const refined = ekispertSeeds
          ? await Promise.all(
              candidateSeeds.map((candidate) => refineCandidateWithEkispert(candidate, appState))
            )
          : candidateSeeds;
        if (!cancelled) {
          const nextCandidates = refined
            .filter((candidate): candidate is Candidate => Boolean(candidate))
            .sort((a, b) => a.score - b.score || a.destinationTime - b.destinationTime);
          setRefinedCandidates(nextCandidates.length > 0 ? nextCandidates : baseCandidates);
        }
      } finally {
        if (!cancelled) setIsRefiningRoutes(false);
      }
    }

    refineRoutes();

    return () => {
      cancelled = true;
    };
  }, [appState, baseCandidates, hasSearched, validationMessage]);

  function updatePerson(id: string, patch: Partial<Person>) {
    setPeople((current) =>
      current.map((person) => (person.id === id ? { ...person, ...patch } : person))
    );
  }

  function addPerson() {
    setPeople((current) => [
      ...current,
      { id: `p${Date.now()}`, name: `一緒に行く人${current.length + 1}`, origin: "" }
    ]);
  }

  function removePerson(id: string) {
    setPeople((current) => current.filter((person) => person.id !== id));
  }

  function handleSearch() {
    setHasSearched(true);
    setToast("");
    if (!validateState(appState)) {
      replaceUrlState(appState);
    }
    window.setTimeout(() => {
      resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
  }

  async function handleShare(candidate: Candidate) {
    const text = formatShareText(candidate, appState);
    const flexMessage = buildShareFlexMessage(candidate, appState);
    setToast("");

    try {
      if (liffClient?.isApiAvailable("shareTargetPicker")) {
        if (!liffClient.isLoggedIn()) {
          setToast("LINEログイン後に共有画面を開きます");
          liffClient.login({ redirectUri: window.location.href });
          return;
        }
        await liffClient.shareTargetPicker([flexMessage], { isMultiple: true });
        setToast("LINEで共有しました");
        return;
      }

      if (liffClient) {
        await copyToClipboard(text);
        setToast("LINE共有が未有効です。LINE Developers ConsoleでShare target pickerを有効にしてください。共有文はコピーしました。");
        return;
      }

      if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
        await navigator.share({
          title: `集合先：${candidate.station}`,
          text
        });
        setToast("共有シートを開きました");
        return;
      }

      await copyToClipboard(text);
      setToast("共有文をコピーしました");
    } catch {
      await copyToClipboard(text);
      setToast("共有文をコピーしました");
    }
  }

  async function handleCopyUrl() {
    const url = buildShareableUrl(appState);
    replaceUrlState(appState);
    await copyToClipboard(url);
    setToast("検索条件URLをコピーしました");
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="brand-row">
          <div className="brand">
            <div className="brand-mark" aria-hidden="true">
              <img src="/kokode.png" alt="" />
            </div>
            <div>
              <h1>KOKODE</h1>
              <p>大切な人との「どこ集合？」をすぐ決めます。</p>
            </div>
          </div>
        </div>
      </header>

      <div className="layout-grid">
        <section className="input-panel" aria-label="検索条件">
          <div className="field-grid">
            <StationInput
              id="destination"
              label="行き先"
              value={destination}
              onChange={setDestination}
              placeholder="行き先の駅名"
            />

            <div className="field">
              <label htmlFor="departure-time">出発時刻</label>
              <input
                id="departure-time"
                className="input"
                type="time"
                value={departureTime}
                onChange={(event) => setDepartureTime(event.target.value)}
              />
              <p className="field-hint">
                {departureTime === currentClock
                  ? `現在時刻 ${currentClock || "--:--"} を基準にしています`
                  : `指定時刻 ${departureTime || "--:--"}（現在 ${currentClock || "--:--"}）`}
              </p>
            </div>

            <div className="field">
              <label htmlFor="priority">優先条件</label>
              <select
                id="priority"
                className="select"
                value={priority}
                onChange={(event) => setPriority(event.target.value as Priority)}
              >
                {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="people-list">
            <div className="section-label">現在地</div>
            {people.map((person, index) => (
              <div className="person-row" key={person.id}>
                <div className="person-name">
                  <span>{person.name || `参加者${index + 1}`}</span>
                </div>
                <div className="person-actions">
                  <StationInput
                    id={`origin-${person.id}`}
                    label={`${person.name || index + 1 + "人目"}の現在地`}
                    value={person.origin}
                    onChange={(value) => updatePerson(person.id, { origin: value })}
                    placeholder={index === 0 ? "あなたの現在地" : "お相手の現在地"}
                    compact
                  />
                  <button
                    className="btn btn-danger"
                    type="button"
                    onClick={() => removePerson(person.id)}
                    disabled={people.length <= 1}
                    aria-label={`${person.name || "参加者"}を削除`}
                    title="削除"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="button-row">
            <button className="btn btn-secondary" type="button" onClick={addPerson}>
              <Plus size={18} />
              参加者を追加
            </button>
            <button className="btn btn-primary" type="button" onClick={handleSearch}>
              <Search size={18} />
              集合先を探す
            </button>
          </div>

          {hasSearched && validationMessage ? <div className="error">{validationMessage}</div> : null}
        </section>

        {hasSearched ? (
          <section className="results-panel" aria-label="検索結果" ref={resultsRef}>
            <div className="panel-heading">
              <h2>候補</h2>
              <button
                className="btn btn-secondary"
                type="button"
                onClick={handleCopyUrl}
                disabled={Boolean(validationMessage)}
              >
                <Copy size={18} />
                条件URLをコピー
              </button>
            </div>

            <div className="toast" aria-live="polite">
              {toast || (isRefiningRoutes ? "駅すぱあとで経路を確認しています..." : "")}
            </div>

            {candidates.length > 0 ? (
              <div className="result-list">
                {candidates.map((candidate, index) => (
                  <article className="result-card" key={candidate.station}>
                    <div className="result-top">
                      <div className="station-title">
                        <span className="rank">{index + 1}</span>
                        <h3>{candidate.station}</h3>
                        {candidate.isDirectDestination ? (
                          <span className="direct-badge">現地集合</span>
                        ) : null}
                      </div>
                      <button
                        className="btn btn-primary"
                        type="button"
                        onClick={() => handleShare(candidate)}
                      >
                        <Share2 size={18} />
                        この集合先を共有
                      </button>
                    </div>

                    <div className="time-grid">
                      <div className="metric">
                        <span>集合目安</span>
                        <strong>{formatClock(candidate.gatherTime)}ごろ</strong>
                      </div>
                      <div className="metric">
                        <span>{candidate.isDirectDestination ? "現地到着目安" : "目的地到着目安"}</span>
                        <strong>{formatClock(candidate.destinationTime)}ごろ</strong>
                      </div>
                    </div>

                    {candidate.reasons.length > 0 ? (
                      <div className="reason-list" aria-label="おすすめ理由">
                        {candidate.reasons.map((reason) => (
                          <span className="reason-chip" key={reason}>
                            {reason}
                          </span>
                        ))}
                      </div>
                    ) : null}

                    <div className="route-list">
                      {candidate.routes.map((route) => (
                        <div className="route-item" key={route.person.id}>
                          <div className="route-title">
                            <strong>{route.person.name || "参加者"}</strong>
                            <span>
                              {route.duration}分 / 乗換{route.transferCount}回 / {formatClock(route.arrivalTime)}着
                            </span>
                          </div>
                          <RouteSteps legs={route.legs} fallbackPath={route.path} fallbackLines={route.lines} />
                        </div>
                      ))}
                      {!candidate.isDirectDestination ? (
                        <div className="route-item">
                          <div className="route-title">
                            <strong>合流後</strong>
                            <span>約{candidate.onwardDuration}分</span>
                          </div>
                          <RouteSteps
                            legs={candidate.onwardLegs}
                            fallbackPath={candidate.onwardPath}
                            fallbackLines={candidate.onwardLines}
                          />
                        </div>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="error">条件に合う集合先が見つかりませんでした。</div>
            )}
          </section>
        ) : null}
      </div>
    </main>
  );
}

function StationInput({
  id,
  label,
  value,
  onChange,
  placeholder,
  compact = false
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  compact?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const [remoteSuggestions, setRemoteSuggestions] = useState<StationSuggestion[]>([]);
  const [selectedStationName, setSelectedStationName] = useState("");
  const localSuggestions = useMemo(() => findStationSuggestions(value), [value]);
  const suggestions = useMemo(
    () => mergeStationSuggestions(localSuggestions, remoteSuggestions),
    [localSuggestions, remoteSuggestions]
  );
  const isResolved =
    Boolean(value.trim()) &&
    Boolean(
      resolveStationName(value) ||
        normalizeStation(selectedStationName) === normalizeStation(value) ||
        remoteSuggestions.some((station) => normalizeStation(station.name) === normalizeStation(value))
    );
  const showSuggestions = focused && suggestions.length > 0;

  useEffect(() => {
    if (selectedStationName && normalizeStation(selectedStationName) !== normalizeStation(value)) {
      setSelectedStationName("");
    }
  }, [selectedStationName, value]);

  useEffect(() => {
    const query = value.trim();
    if (!focused || query.length < 1) {
      setRemoteSuggestions([]);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/stations?q=${encodeURIComponent(query)}`);
        if (!response.ok) return;
        const data = (await response.json()) as {
          stations?: Array<{ name: string; yomi?: string; prefecture?: string }>;
        };
        if (!cancelled) {
          setRemoteSuggestions(
            (data.stations ?? []).map((station) => ({
              name: station.name,
              yomi: station.yomi,
              prefecture: station.prefecture,
              source: "ekispert"
            }))
          );
        }
      } catch {
        if (!cancelled) setRemoteSuggestions([]);
      }
    }, 450);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [focused, value]);

  return (
    <div className={compact ? "field station-field compact-field" : "field station-field"}>
      {!compact ? <label htmlFor={id}>{label}</label> : null}
      <input
        id={id}
        className="input"
        aria-label={label}
        autoCapitalize="none"
        autoComplete="new-password"
        autoCorrect="off"
        enterKeyHint="search"
        inputMode="search"
        name={`kokode-${id}-station`}
        spellCheck={false}
        value={value}
        onBlur={() => window.setTimeout(() => setFocused(false), 120)}
        onChange={(event) => {
          setSelectedStationName("");
          onChange(event.target.value);
        }}
        onFocus={() => setFocused(true)}
        placeholder={placeholder}
      />
      {isResolved ? <span className="resolved-station">選択済み</span> : null}
      {showSuggestions ? (
        <div className="suggestion-list">
          {suggestions.map((station) => (
            <button
              className="suggestion-item"
              key={`${station.source}-${station.name}`}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                setSelectedStationName(station.name);
                onChange(station.name);
                setFocused(false);
                setRemoteSuggestions([]);
              }}
            >
              <MapPin size={14} />
              <span>{station.name}</span>
              {station.prefecture ? <small>{station.prefecture}</small> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function LineBadges({ lines }: { lines: LineMeta[] }) {
  const visibleLines = uniqueLines(lines).slice(0, 5);
  if (visibleLines.length === 0) return null;

  return (
    <div className="line-badges" aria-label="利用路線">
      {visibleLines.map((line) => (
        <span className="line-badge" key={`${line.operator}-${line.name}`}>
          <span className="line-symbol" style={{ backgroundColor: line.color }}>
            {line.symbol}
          </span>
          {line.operator} {line.name}
        </span>
      ))}
    </div>
  );
}

function RouteSteps({
  legs,
  fallbackPath,
  fallbackLines
}: {
  legs: RouteLeg[];
  fallbackPath: string[];
  fallbackLines: LineMeta[];
}) {
  if (legs.length === 0) {
    return (
      <>
        <LineBadges lines={fallbackLines} />
        <p className="route-path">{fallbackPath.join(" → ")}</p>
      </>
    );
  }

  const displayLegs = mergeConsecutiveLegs(legs);

  return (
    <div className="route-steps">
      {displayLegs.map((leg, index) => (
        <div className="route-step" key={`${leg.from}-${leg.to}-${index}`}>
          {index > 0 ? <div className="transfer-note">{leg.from}で乗り換え</div> : null}
          <div className="leg-stations">
            <span>{leg.from}</span>
            <span aria-hidden="true">→</span>
            <span>{leg.to}</span>
          </div>
          <div className="leg-line">
            <span className="line-symbol" style={{ backgroundColor: leg.lineColor }}>
              {leg.lineSymbol || (leg.isWalk ? "歩" : "路")}
            </span>
            <span>{leg.lineName}</span>
            <span>{leg.duration > 0 ? `${leg.duration}分` : "所要時間確認中"}</span>
            {leg.departureTime && leg.arrivalTime ? (
              <span>
                {leg.departureTime}→{leg.arrivalTime}
              </span>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

function mergeConsecutiveLegs(legs: RouteLeg[]) {
  const merged: RouteLeg[] = [];

  for (const leg of legs) {
    const previous = merged.at(-1);
    const sameLine =
      previous &&
      previous.to === leg.from &&
      previous.lineName === leg.lineName &&
      previous.lineSymbol === leg.lineSymbol &&
      previous.isWalk === leg.isWalk;

    if (sameLine) {
      previous.to = leg.to;
      previous.duration += leg.duration;
      previous.arrivalTime = leg.arrivalTime ?? previous.arrivalTime;
      continue;
    }

    merged.push({ ...leg });
  }

  return merged;
}

function findStationSuggestions(value: string) {
  const query = normalizeStation(value);
  if (!query) {
    return [];
  }

  return stationNames
    .filter((station) => normalizeStation(station).includes(query))
    .slice(0, 8)
    .map((name) => ({ name, source: "local" as const }));
}

function mergeStationSuggestions(
  localSuggestions: StationSuggestion[],
  remoteSuggestions: StationSuggestion[]
) {
  const merged: StationSuggestion[] = [];
  const seen = new Set<string>();

  for (const station of [...remoteSuggestions, ...localSuggestions]) {
    const key = normalizeStation(station.name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(station);
  }

  return merged.slice(0, 12);
}

function normalizeStation(value: string) {
  return value.trim().toLocaleLowerCase("ja-JP").replace(/駅$/u, "");
}

function resolveStationName(value: string) {
  const normalized = normalizeStation(value);
  return stationNames.find((station) => normalizeStation(station) === normalized) ?? null;
}

function toEdges(stations: string[], minutes: number, line: LineMeta): EdgeTuple[] {
  return stations.slice(0, -1).map((station, index) => [station, stations[index + 1], minutes, line]);
}

function buildGraph(edges: EdgeTuple[]) {
  const map = new Map<string, GraphEdge[]>();

  for (const [from, to, minutes, line] of edges) {
    if (!map.has(from)) map.set(from, []);
    if (!map.has(to)) map.set(to, []);
    map.get(from)?.push({ station: to, minutes, line });
    map.get(to)?.push({ station: from, minutes, line });
  }

  return map;
}

function validateState(state: AppState) {
  if (!state.destination.trim()) return "行き先を入力してください。";
  if (!state.departureTime) return "出発時刻を入力してください。";
  if (state.people.length === 0) return "参加者を1人以上入力してください。";

  const emptyPerson = state.people.find((person) => !person.name.trim() || !person.origin.trim());
  if (emptyPerson) return "参加者の名前と現在地を入力してください。";

  return "";
}

function calculateCandidates(state: AppState) {
  const departureMinutes = parseClock(state.departureTime);
  const destination = resolveStationName(state.destination) ?? state.destination.trim();
  const cleanPeople = state.people.map((person) => ({
    ...person,
    name: person.name.trim(),
    origin: resolveStationName(person.origin) ?? person.origin.trim()
  }));

  return [buildDirectDestinationCandidate(destination, cleanPeople, departureMinutes, state.priority)];
}

function calculateFallbackCandidates(state: AppState) {
  const departureMinutes = parseClock(state.departureTime);
  const destination = resolveStationName(state.destination) ?? state.destination.trim();
  const cleanPeople = state.people.map((person) => ({
    ...person,
    name: person.name.trim(),
    origin: resolveStationName(person.origin) ?? person.origin.trim()
  }));
  const canUseLocalGraph =
    graph.has(destination) && cleanPeople.every((person) => graph.has(person.origin));

  if (!canUseLocalGraph) {
    return [buildDirectDestinationCandidate(destination, cleanPeople, departureMinutes, state.priority)];
  }

  const routeMaps = cleanPeople.map((person) => dijkstra(person.origin));
  const destinationRoutes = dijkstra(destination);
  const candidates: Candidate[] = [];

  for (const station of stationNames) {
    const onwardDuration = destinationRoutes.distances.get(station);
    if (onwardDuration === undefined) continue;
    const isDirectDestination = station === destination;

    const routes: RouteResult[] = [];
    let isReachable = true;

    for (let index = 0; index < cleanPeople.length; index += 1) {
      const person = cleanPeople[index];
      const routeMap = routeMaps[index];
      const duration = routeMap.distances.get(station);
      if (duration === undefined) {
        isReachable = false;
        break;
      }
      const path = reconstructPath(routeMap.previous, person.origin, station);
      routes.push({
        person,
        duration,
        arrivalTime: departureMinutes + duration,
        path,
        lines: linesForPath(path),
        legs: fallbackLegsForPath(path),
        transferCount: Math.max(0, linesForPath(path).length - 1)
      });
    }

    if (!isReachable) continue;
    if (
      !isDirectDestination &&
      routes.some((route) => routePassesDestinationBeforeMeetup(route.path, destination))
    ) {
      continue;
    }

    const gatherTime = Math.max(...routes.map((route) => route.arrivalTime));
    const destinationTime = gatherTime + onwardDuration;
    const waitingTotal = routes.reduce((sum, route) => sum + (gatherTime - route.arrivalTime), 0);
    const durations = routes.map((route) => route.duration);
    const spread = Math.max(...durations) - Math.min(...durations);
    const transferTotal = routes.reduce((sum, route) => sum + route.transferCount, 0);
    const score = scoreCandidate(
      state.priority,
      destinationTime,
      waitingTotal,
      spread,
      gatherTime,
      isDirectDestination,
      transferTotal
    );

    candidates.push({
      station,
      isDirectDestination,
      gatherTime,
      destinationTime,
      onwardDuration,
      onwardPath: reconstructPath(destinationRoutes.previous, destination, station).reverse(),
      onwardLines: linesForPath(reconstructPath(destinationRoutes.previous, destination, station).reverse()),
      onwardLegs: fallbackLegsForPath(reconstructPath(destinationRoutes.previous, destination, station).reverse()),
      waitingTotal,
      transferTotal,
      score,
      routes,
      reasons: buildFallbackReasons(isDirectDestination, onwardDuration)
    });
  }

  return candidates.sort((a, b) => a.score - b.score || a.destinationTime - b.destinationTime);
}

function buildDirectDestinationCandidate(
  destination: string,
  people: Person[],
  departureMinutes: number,
  priority: Priority
): Candidate {
  const routes = people.map((person) => ({
    person,
    duration: 0,
    arrivalTime: departureMinutes,
    path: [person.origin, destination],
    lines: [],
    legs: [
      {
        from: person.origin,
        to: destination,
        lineName: "経路確認中",
        lineSymbol: "…",
        lineColor: "#66726D",
        duration: 0
      }
    ],
    transferCount: 0
  }));

  return {
    station: destination,
    isDirectDestination: true,
    gatherTime: departureMinutes,
    destinationTime: departureMinutes,
    onwardDuration: 0,
    onwardPath: [destination],
    onwardLines: [],
    onwardLegs: [],
    waitingTotal: 0,
    transferTotal: 0,
    score: scoreCandidate(priority, departureMinutes, 0, 0, departureMinutes, true, 0),
    routes,
    reasons: ["現地集合なら集合後の移動がありません"]
  };
}

async function buildEkispertCandidateSeeds(baseCandidates: Candidate[], state: AppState) {
  const shouldExpand =
    baseCandidates.length === 1 &&
    baseCandidates[0].isDirectDestination &&
    baseCandidates[0].routes.every((route) =>
      route.legs.some((leg) => leg.lineName === "経路確認中")
    );

  if (!shouldExpand) return null;

  const departureMinutes = parseClock(state.departureTime);
  const destination = resolveStationName(state.destination) ?? state.destination.trim();
  const cleanPeople = state.people.map((person) => ({
    ...person,
    name: person.name.trim(),
    origin: resolveStationName(person.origin) ?? person.origin.trim()
  }));

  const directRoutes = await Promise.all(
    cleanPeople.map((person) =>
      fetchEkispertRoute(person.origin, destination, state.departureTime, state.priority)
    )
  );

  if (directRoutes.some((route) => !route)) return null;

  const availableDirectRoutes = directRoutes as EkispertRoute[];
  const directCandidate = buildCandidateFromKnownRoutes({
    station: destination,
    people: cleanPeople,
    routes: availableDirectRoutes,
    departureMinutes,
    priority: state.priority,
    isDirectDestination: true
  });
  const meetupStations = pickEkispertMeetupStations(availableDirectRoutes, destination, cleanPeople);
  const meetupCandidates = meetupStations.map((station) =>
    buildPendingCandidate(
      station,
      destination,
      cleanPeople,
      departureMinutes,
      state.priority,
      directCandidate.routes
    )
  );

  return [directCandidate, ...meetupCandidates].slice(0, EKISPERT_MEETUP_CANDIDATE_LIMIT);
}

function buildCandidateFromKnownRoutes({
  station,
  people,
  routes,
  departureMinutes,
  priority,
  isDirectDestination
}: {
  station: string;
  people: Person[];
  routes: EkispertRoute[];
  departureMinutes: number;
  priority: Priority;
  isDirectDestination: boolean;
}): Candidate {
  const routeResults = routes.map((route, index) => ({
    person: people[index],
    duration: route.duration,
    arrivalTime: departureMinutes + route.duration,
    path: route.path.length > 0 ? route.path : [people[index].origin, station],
    lines: route.lines.map(toLineMetaFromEkispert),
    legs: route.legs.length > 0 ? route.legs : fallbackLegsForPath(route.path),
    transferCount: route.transferCount
  }));
  const gatherTime = Math.max(...routeResults.map((route) => route.arrivalTime));
  const waitingTotal = routeResults.reduce((sum, route) => sum + (gatherTime - route.arrivalTime), 0);
  const durations = routeResults.map((route) => route.duration);
  const spread = Math.max(...durations) - Math.min(...durations);
  const transferTotal = routeResults.reduce((sum, route) => sum + route.transferCount, 0);
  const score = scoreCandidate(
    priority,
    gatherTime,
    waitingTotal,
    spread,
    gatherTime,
    isDirectDestination,
    transferTotal
  );

  return {
    station,
    isDirectDestination,
    gatherTime,
    destinationTime: gatherTime,
    onwardDuration: 0,
    onwardPath: [station],
    onwardLines: [],
    onwardLegs: [],
    waitingTotal,
    transferTotal,
    score,
    routes: routeResults,
    directRoutes: routeResults,
    reasons: ["現地集合なら集合後の移動がありません"]
  };
}

function buildPendingCandidate(
  station: string,
  destination: string,
  people: Person[],
  departureMinutes: number,
  priority: Priority,
  directRoutes?: RouteResult[]
): Candidate {
  const routes = people.map((person) => ({
    person,
    duration: 0,
    arrivalTime: departureMinutes,
    path: [person.origin, station],
    lines: [],
    legs: [
      {
        from: person.origin,
        to: station,
        lineName: "経路確認中",
        lineSymbol: "…",
        lineColor: "#66726D",
        duration: 0
      }
    ],
    transferCount: 0
  }));

  return {
    station,
    isDirectDestination: false,
    gatherTime: departureMinutes,
    destinationTime: departureMinutes,
    onwardDuration: 0,
    onwardPath: [station, destination],
    onwardLines: [],
    onwardLegs: [
      {
        from: station,
        to: destination,
        lineName: "経路確認中",
        lineSymbol: "…",
        lineColor: "#66726D",
        duration: 0
      }
    ],
    waitingTotal: 0,
    transferTotal: 0,
    score: scoreCandidate(priority, departureMinutes, 0, 0, departureMinutes, false, 0),
    routes,
    directRoutes,
    reasons: ["駅すぱあとで目的地方向への自然さを確認しています"]
  };
}

function pickEkispertMeetupStations(routes: EkispertRoute[], destination: string, people: Person[]) {
  const origins = new Set(people.map((person) => normalizeStation(person.origin)));
  const destinationKey = normalizeStation(destination);
  const scoredStations = new Map<string, { score: number; count: number }>();

  for (const route of routes) {
    const path = route.path.filter(Boolean);
    const denominator = Math.max(1, path.length - 1);

    path.forEach((station, index) => {
      const normalized = normalizeStation(station);
      if (!normalized || normalized === destinationKey || origins.has(normalized)) return;
      if (isLargeTerminalStation(station)) return;
      const progress = index / denominator;
      const destinationDirectionScore = progress * 5;
      const convergenceScore = progress >= 0.35 ? 2 : 0;
      const terminalPenalty = isLargeTerminalStation(station) ? -3 : 0;
      const hubScore =
        majorHubStations.some((hub) => normalizeStation(hub) === normalized) &&
        !isLargeTerminalStation(station)
          ? 1
          : 0;
      const current = scoredStations.get(station) ?? { score: 0, count: 0 };
      scoredStations.set(station, {
        count: current.count + 1,
        score: current.score + destinationDirectionScore + convergenceScore + terminalPenalty + hubScore
      });
    });
  }

  return Array.from(scoredStations.entries())
    .sort((a, b) => b[1].count - a[1].count || b[1].score - a[1].score)
    .map(([station]) => station)
    .slice(0, EKISPERT_MEETUP_CANDIDATE_LIMIT - 1);
}

async function refineCandidateWithEkispert(candidate: Candidate, state: AppState) {
  const departureMinutes = parseClock(state.departureTime);
  const destination = resolveStationName(state.destination) ?? state.destination.trim();
  const refinedRoutes: RouteResult[] = [];
  let usedEkispert = false;

  for (const route of candidate.routes) {
    if (!isPendingRoute(route)) {
      usedEkispert = true;
      refinedRoutes.push(route);
      continue;
    }

    const ekispertRoute = await fetchEkispertRoute(
      route.person.origin,
      candidate.station,
      state.departureTime,
      state.priority
    );

    if (ekispertRoute) {
      usedEkispert = true;
      const path = ekispertRoute.path;
      if (
        !candidate.isDirectDestination &&
        routePassesDestinationBeforeMeetup(path, destination)
      ) {
        return null;
      }

      refinedRoutes.push({
        ...route,
        duration: ekispertRoute.duration,
        arrivalTime: departureMinutes + ekispertRoute.duration,
        path,
        lines: ekispertRoute.lines.map(toLineMetaFromEkispert),
        legs: ekispertRoute.legs.length > 0 ? ekispertRoute.legs : fallbackLegsForPath(path),
        transferCount: ekispertRoute.transferCount
      });
    } else {
      return null;
    }
  }

  const onwardEkispertRoute = candidate.isDirectDestination
    ? null
    : await fetchEkispertRoute(candidate.station, destination, state.departureTime, state.priority);

  if (!candidate.isDirectDestination && !onwardEkispertRoute) {
    return null;
  }

  const gatherTime = Math.max(...refinedRoutes.map((route) => route.arrivalTime));
  const onwardDuration = onwardEkispertRoute?.duration ?? candidate.onwardDuration;
  const onwardPath = onwardEkispertRoute?.path ?? candidate.onwardPath;
  const onwardLines = onwardEkispertRoute
    ? onwardEkispertRoute.lines.map(toLineMetaFromEkispert)
    : candidate.onwardLines;
  const onwardLegs = onwardEkispertRoute
    ? onwardEkispertRoute.legs
    : candidate.onwardLegs;

  if (
    !candidate.isDirectDestination &&
    isUnnaturalDetourCandidate(candidate, refinedRoutes, onwardDuration)
  ) {
    return null;
  }

  const destinationTime = gatherTime + onwardDuration;
  const waitingTotal = refinedRoutes.reduce((sum, route) => sum + (gatherTime - route.arrivalTime), 0);
  const durations = refinedRoutes.map((route) => route.duration);
  const spread = Math.max(...durations) - Math.min(...durations);
  const transferTotal =
    refinedRoutes.reduce((sum, route) => sum + route.transferCount, 0) +
    (onwardEkispertRoute?.transferCount ?? 0);
  const recommendation = evaluateRecommendationScore({
    candidate,
    priority: state.priority,
    departureMinutes,
    destinationTime,
    waitingTotal,
    spread,
    gatherTime,
    transferTotal,
    refinedRoutes,
    onwardDuration,
    onwardLegs
  });

  return {
    ...candidate,
    gatherTime,
    destinationTime,
    onwardDuration,
    onwardPath,
    onwardLines,
    onwardLegs,
    waitingTotal,
    transferTotal,
    score: usedEkispert || onwardEkispertRoute ? recommendation.score - 2 : recommendation.score,
    routes: refinedRoutes,
    reasons: recommendation.reasons
  };
}

function isPendingRoute(route: RouteResult) {
  return route.legs.length === 0 || route.legs.some((leg) => leg.lineName === "経路確認中");
}

function isUnnaturalDetourCandidate(
  candidate: Candidate,
  refinedRoutes: RouteResult[],
  onwardDuration: number
) {
  if (!candidate.directRoutes || candidate.directRoutes.length === 0) return false;

  if (isLargeTerminalStation(candidate.station) && onwardDuration > 12) {
    const progresses = directRouteProgresses(candidate, refinedRoutes);
    const averageProgress =
      progresses.reduce((sum, progress) => sum + progress, 0) / Math.max(1, progresses.length);
    if (progresses.length < refinedRoutes.length || averageProgress < 0.65) return true;
  }

  return refinedRoutes.some((route) => {
    const directRoute = candidate.directRoutes?.find(
      (direct) => direct.person.id === route.person.id
    );
    if (!directRoute || directRoute.duration <= 0) return false;

    const stationIsOnDirectRoute = directRoute.path
      .map(normalizeStation)
      .includes(normalizeStation(candidate.station));
    const combinedDuration = route.duration + onwardDuration;
    const absoluteDetour = combinedDuration - directRoute.duration;
    const relativeDetour = combinedDuration / directRoute.duration;

    if (!stationIsOnDirectRoute && absoluteDetour > 6) return true;
    return absoluteDetour > 10 && relativeDetour > 1.35;
  });
}

function directRouteProgresses(candidate: Candidate, refinedRoutes: RouteResult[]) {
  if (!candidate.directRoutes) return [];

  return refinedRoutes
    .map((route) => {
      const directRoute = candidate.directRoutes?.find((direct) => direct.person.id === route.person.id);
      if (!directRoute) return null;
      const directPath = directRoute.path.map(normalizeStation);
      const directIndex = directPath.indexOf(normalizeStation(candidate.station));
      if (directIndex < 0) return null;
      return directIndex / Math.max(1, directPath.length - 1);
    })
    .filter((progress): progress is number => progress !== null);
}

function evaluateRecommendationScore({
  candidate,
  priority,
  departureMinutes,
  destinationTime,
  waitingTotal,
  spread,
  gatherTime,
  transferTotal,
  refinedRoutes,
  onwardDuration,
  onwardLegs
}: {
  candidate: Candidate;
  priority: Priority;
  departureMinutes: number;
  destinationTime: number;
  waitingTotal: number;
  spread: number;
  gatherTime: number;
  transferTotal: number;
  refinedRoutes: RouteResult[];
  onwardDuration: number;
  onwardLegs: RouteLeg[];
}) {
  const destinationDirectionScore = destinationDirectionPenalty(candidate, refinedRoutes, onwardDuration);
  const afterMeetingTogetherScore = afterMeetingTogetherPenalty(candidate, onwardLegs);
  const stationSimplicityScore = stationSimplicityPenalty(candidate.station);
  const arrivalTimeScore = destinationTime - departureMinutes;
  const transferScore = transferTotal * 8;
  const waitingScore = waitingTotal;
  const fairnessScore = spread;
  const priorityAdjustment =
    priority === "fast"
      ? arrivalTimeScore * 0.18
      : priority === "fair"
        ? fairnessScore * 0.25 + waitingScore * 0.2
        : transferScore * 0.12;
  const directBonus = candidate.isDirectDestination ? -4 : 0;
  const score =
    fairnessScore * 0.15 +
    transferScore * 0.15 +
    waitingScore * 0.1 +
    arrivalTimeScore * 0.15 +
    destinationDirectionScore * 0.2 +
    afterMeetingTogetherScore * 0.15 +
    stationSimplicityScore * 0.1 +
    priorityAdjustment +
    directBonus;

  return {
    score,
    reasons: buildRecommendationReasons(
      candidate,
      refinedRoutes,
      onwardDuration,
      onwardLegs,
      destinationDirectionScore,
      afterMeetingTogetherScore,
      stationSimplicityScore
    )
  };
}

function destinationDirectionPenalty(
  candidate: Candidate,
  refinedRoutes: RouteResult[],
  onwardDuration: number
) {
  if (candidate.isDirectDestination) return 0;
  if (!candidate.directRoutes || candidate.directRoutes.length === 0) return 12;

  const penalties = refinedRoutes.map((route) => {
    const directRoute = candidate.directRoutes?.find((direct) => direct.person.id === route.person.id);
    if (!directRoute || directRoute.duration <= 0) return 10;

    const normalizedCandidate = normalizeStation(candidate.station);
    const directPath = directRoute.path.map(normalizeStation);
    const directIndex = directPath.indexOf(normalizedCandidate);
    const combinedDuration = route.duration + onwardDuration;
    const detour = Math.max(0, combinedDuration - directRoute.duration);

    if (directIndex >= 0) {
      const progress = directIndex / Math.max(1, directPath.length - 1);
      const earlyPenalty = progress < 0.3 ? 5 : 0;
      const nearDestinationBonus = progress >= 0.65 ? -8 : progress >= 0.45 ? -4 : 0;
      return Math.max(-10, detour * 0.4 + earlyPenalty + nearDestinationBonus);
    }

    return 18 + detour * 1.5;
  });

  const average = penalties.reduce((sum, penalty) => sum + penalty, 0) / penalties.length;
  const allDirectPathsIncludeStation = refinedRoutes.every((route) => {
    const directRoute = candidate.directRoutes?.find((direct) => direct.person.id === route.person.id);
    return directRoute?.path.map(normalizeStation).includes(normalizeStation(candidate.station));
  });

  return allDirectPathsIncludeStation ? average - 6 : average + 18;
}

function afterMeetingTogetherPenalty(candidate: Candidate, onwardLegs: RouteLeg[]) {
  if (candidate.isDirectDestination) return -8;
  const displayLegs = mergeConsecutiveLegs(onwardLegs);
  if (displayLegs.length === 0) return 8;
  const transferPenalty = Math.max(0, displayLegs.length - 1) * 8;
  const sameTrainBonus = displayLegs.length === 1 ? -12 : 0;
  const shortOnwardBonus = displayLegs.reduce((sum, leg) => sum + leg.duration, 0) <= 12 ? -6 : 0;
  return transferPenalty + sameTrainBonus + shortOnwardBonus;
}

function stationSimplicityPenalty(station: string) {
  if (isLargeTerminalStation(station)) return 48;
  if (majorHubStations.some((hub) => normalizeStation(hub) === normalizeStation(station))) return 5;
  return 0;
}

function isLargeTerminalStation(station: string) {
  return largeTerminalStations.some((terminal) => normalizeStation(terminal) === normalizeStation(station));
}

function buildRecommendationReasons(
  candidate: Candidate,
  refinedRoutes: RouteResult[],
  onwardDuration: number,
  onwardLegs: RouteLeg[],
  destinationDirectionScore: number,
  afterMeetingTogetherScore: number,
  stationSimplicityScore: number
) {
  const reasons: string[] = [];
  const directRouteMatches = refinedRoutes.filter((route) => {
    const directRoute = candidate.directRoutes?.find((direct) => direct.person.id === route.person.id);
    return directRoute?.path.map(normalizeStation).includes(normalizeStation(candidate.station));
  }).length;
  const displayLegs = mergeConsecutiveLegs(onwardLegs);

  if (candidate.isDirectDestination) {
    reasons.push("現地集合なら集合後の移動がありません");
  } else if (isLargeTerminalStation(candidate.station) && onwardDuration > 12) {
    reasons.push("駅が大きく目的地手前でもないため、待ち合わせ候補としては控えめです");
  } else if (directRouteMatches === refinedRoutes.length) {
    reasons.push("2人の経路が目的地方向に自然に合流します");
  } else if (destinationDirectionScore >= 18) {
    reasons.push("出発地同士の中間ですが、目的地方向から外れるため優先度を下げました");
  } else {
    reasons.push("乗換はありますが、目的地方向へ進みやすい候補です");
  }

  if (!candidate.isDirectDestination && onwardDuration <= 12) {
    reasons.push("目的地の手前で合流できます");
  }

  if (!candidate.isDirectDestination && afterMeetingTogetherScore < 0) {
    reasons.push("合流後に同じ方向へ一緒に向かいやすい候補です");
  } else if (!candidate.isDirectDestination && displayLegs.length > 1) {
    reasons.push("合流後の乗換があるため少し優先度を下げています");
  }

  if (stationSimplicityScore >= 10) {
    reasons.push("駅が大きいため待ち合わせしやすさは控えめです");
  }

  return reasons.slice(0, 3);
}

function buildFallbackReasons(isDirectDestination: boolean, onwardDuration: number) {
  if (isDirectDestination) return ["現地集合なら集合後の移動がありません"];
  if (onwardDuration <= 12) return ["目的地の手前で合流できます"];
  return ["目的地方向へ進みやすい候補です"];
}

async function fetchEkispertRoute(from: string, to: string, departureTime: string, priority: Priority) {
  try {
    const params = new URLSearchParams({
      from,
      to,
      time: departureTime,
      sort: priority === "fast" ? "time" : "transfer"
    });
    const response = await fetch(`/api/routes?${params.toString()}`);
    if (!response.ok) return null;
    const data = (await response.json()) as { route?: EkispertRoute | null };
    if (!data.route || data.route.duration < 0) return null;
    return data.route;
  } catch {
    return null;
  }
}

function toLineMetaFromEkispert(line: EkispertRoute["lines"][number]): LineMeta {
  return {
    operator: "駅すぱあと",
    name: line.name,
    symbol: line.symbol || "路",
    color: line.color || "#66726D"
  };
}

function scoreCandidate(
  priority: Priority,
  destinationTime: number,
  waitingTotal: number,
  spread: number,
  gatherTime: number,
  isDirectDestination: boolean,
  transferTotal: number
) {
  const directBonus = isDirectDestination ? -8 : 0;
  if (priority === "fast") return destinationTime + transferTotal * 8 + waitingTotal * 0.1 + directBonus;
  if (priority === "fair") return transferTotal * 22 + destinationTime * 0.75 + spread * 3 + waitingTotal * 1.5 + directBonus;
  return transferTotal * 32 + destinationTime * 0.9 + gatherTime * 0.1 + waitingTotal * 0.45 + spread + directBonus;
}

function routePassesDestinationBeforeMeetup(path: string[], destination: string) {
  const destinationIndex = path.indexOf(destination);
  return destinationIndex >= 0 && destinationIndex < path.length - 1;
}

function linesForPath(path: string[]) {
  const lines: LineMeta[] = [];

  for (let index = 0; index < path.length - 1; index += 1) {
    const from = path[index];
    const to = path[index + 1];
    const edge = graph.get(from)?.find((candidate) => candidate.station === to);
    if (edge) lines.push(edge.line);
  }

  return uniqueLines(lines);
}

function fallbackLegsForPath(path: string[]): RouteLeg[] {
  const legs: RouteLeg[] = [];

  for (let index = 0; index < path.length - 1; index += 1) {
    const from = path[index];
    const to = path[index + 1];
    const edge = graph.get(from)?.find((candidate) => candidate.station === to);
    const line = edge?.line ?? TRANSFER_LINE;
    legs.push({
      from,
      to,
      lineName: line.name,
      lineSymbol: line.symbol,
      lineColor: line.color,
      duration: edge?.minutes ?? 0,
      isWalk: line.name.includes("連絡")
    });
  }

  return legs;
}

function uniqueLines(lines: LineMeta[]) {
  const seen = new Set<string>();
  const unique: LineMeta[] = [];

  for (const line of lines) {
    const key = `${line.operator}-${line.name}-${line.symbol}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(line);
  }

  return unique;
}

function dijkstra(start: string): DijkstraResult {
  const distances = new Map<string, number>();
  const previous = new Map<string, string>();
  const unvisited = new Set(graph.keys());

  for (const station of graph.keys()) {
    distances.set(station, station === start ? 0 : Number.POSITIVE_INFINITY);
  }

  while (unvisited.size > 0) {
    let current = "";
    let currentDistance = Number.POSITIVE_INFINITY;

    for (const station of unvisited) {
      const distance = distances.get(station) ?? Number.POSITIVE_INFINITY;
      if (distance < currentDistance) {
        current = station;
        currentDistance = distance;
      }
    }

    if (!current || currentDistance === Number.POSITIVE_INFINITY) break;
    unvisited.delete(current);

    for (const edge of graph.get(current) ?? []) {
      if (!unvisited.has(edge.station)) continue;
      const nextDistance = currentDistance + edge.minutes;
      if (nextDistance < (distances.get(edge.station) ?? Number.POSITIVE_INFINITY)) {
        distances.set(edge.station, nextDistance);
        previous.set(edge.station, current);
      }
    }
  }

  for (const [station, distance] of distances) {
    if (distance === Number.POSITIVE_INFINITY) distances.delete(station);
  }

  return { distances, previous };
}

function reconstructPath(previous: Map<string, string>, from: string, to: string) {
  if (from === to) return [from];

  const path = [to];
  let cursor = to;

  while (cursor !== from) {
    const next = previous.get(cursor);
    if (!next) return [from, to];
    path.push(next);
    cursor = next;
  }

  return path.reverse();
}

function buildShareFlexMessage(candidate: Candidate, state: AppState): LineFlexMessage {
  const destination = state.destination.trim();
  const routeItems = candidate.routes.slice(0, 5).flatMap((route) => [
    {
      type: "box",
      layout: "vertical",
      spacing: "xs",
      margin: "md",
      contents: [
        {
          type: "box",
          layout: "horizontal",
          contents: [
            {
              type: "text",
              text: route.person.name,
              weight: "bold",
              size: "sm",
              color: "#17231F",
              flex: 1
            },
            {
              type: "text",
              text: `${route.duration}分 / ${formatClock(route.arrivalTime)}着`,
              size: "xs",
              color: "#66726D",
              align: "end",
              flex: 2
            }
          ]
        },
        {
          type: "text",
          text: formatLegsCompact(route.legs, route.path),
          size: "xs",
          color: "#485650",
          wrap: true
        }
      ]
    },
    {
      type: "separator",
      margin: "md",
      color: "#E4E8E3"
    }
  ]);

  if (routeItems[routeItems.length - 1]?.type === "separator") {
    routeItems.pop();
  }

  const contents: Record<string, unknown> = {
    type: "bubble",
    size: "mega",
    body: {
      type: "box",
      layout: "vertical",
      spacing: "md",
      contents: [
        {
          type: "text",
          text: candidate.isDirectDestination ? "現地集合でよさそう" : "ここで集合しない？",
          size: "sm",
          color: "#0F766E",
          weight: "bold"
        },
        {
          type: "text",
          text: candidate.station,
          size: "xxl",
          weight: "bold",
          color: "#17231F",
          wrap: true
        },
        {
          type: "text",
          text: candidate.isDirectDestination ? `行き先：${destination}` : `行き先：${destination}`,
          size: "sm",
          color: "#66726D",
          wrap: true
        },
        {
          type: "box",
          layout: "horizontal",
          spacing: "sm",
          contents: [
            {
              type: "box",
              layout: "vertical",
              backgroundColor: "#DFF3EA",
              cornerRadius: "md",
              paddingAll: "md",
              contents: [
                { type: "text", text: "集合目安", size: "xs", color: "#115E59", weight: "bold" },
                {
                  type: "text",
                  text: `${formatClock(candidate.gatherTime)}ごろ`,
                  size: "lg",
                  weight: "bold",
                  color: "#17231F"
                }
              ]
            },
            {
              type: "box",
              layout: "vertical",
              backgroundColor: "#FFF1D6",
              cornerRadius: "md",
              paddingAll: "md",
              contents: [
                {
                  type: "text",
                  text: candidate.isDirectDestination ? "現地到着" : "目的地到着",
                  size: "xs",
                  color: "#7A3318",
                  weight: "bold"
                },
                {
                  type: "text",
                  text: `${formatClock(candidate.destinationTime)}ごろ`,
                  size: "lg",
                  weight: "bold",
                  color: "#17231F"
                }
              ]
            }
          ]
        },
        {
          type: "text",
          text: "各自の行き方",
          size: "sm",
          color: "#17231F",
          weight: "bold",
          margin: "lg"
        },
        ...routeItems,
        ...(candidate.isDirectDestination
          ? []
          : [
              {
                type: "box",
                layout: "vertical",
                spacing: "xs",
                margin: "lg",
                contents: [
                  {
                    type: "text",
                    text: "合流後",
                    size: "sm",
                    weight: "bold",
                    color: "#17231F"
                  },
                  {
                    type: "text",
                    text: `${formatLegsCompact(candidate.onwardLegs, candidate.onwardPath)} / 約${candidate.onwardDuration}分`,
                    size: "xs",
                    color: "#485650",
                    wrap: true
                  }
                ]
              }
            ])
      ]
    }
  };

  return {
    type: "flex",
    altText: candidate.isDirectDestination
      ? `現地集合：${candidate.station} ${formatClock(candidate.gatherTime)}ごろ`
      : `集合先：${candidate.station} ${formatClock(candidate.gatherTime)}ごろ`,
    contents
  };
}

function formatLegsCompact(legs: RouteLeg[], fallbackPath: string[]) {
  if (legs.length === 0) return fallbackPath.join(" → ");
  return mergeConsecutiveLegs(legs)
    .map((leg) => `${leg.from} → ${leg.to}（${leg.lineName}${leg.duration ? ` ${leg.duration}分` : ""}）`)
    .join(" / ");
}

function formatLegsForText(legs: RouteLeg[], fallbackPath: string[]) {
  if (legs.length === 0) return [fallbackPath.join(" → ")];
  return mergeConsecutiveLegs(legs).flatMap((leg, index) => [
    ...(index > 0 ? [`${leg.from}で乗り換え`] : []),
    `${leg.from} → ${leg.to}`,
    `${leg.lineName}${leg.duration ? ` / ${leg.duration}分` : ""}`
  ]);
}

function formatShareText(candidate: Candidate, state: AppState) {
  const lines = [
    candidate.isDirectDestination ? "現地集合でよさそう" : "ここで集合しない？",
    "",
    `${candidate.isDirectDestination ? "現地集合" : "集合先"}：${candidate.station}`,
    `行き先：${state.destination.trim()}`,
    `集合目安：${formatClock(candidate.gatherTime)}ごろ`,
    `目的地到着目安：${formatClock(candidate.destinationTime)}ごろ`,
    "",
    "各自の行き方"
  ];

  for (const route of candidate.routes) {
    lines.push(
      `・${route.person.name}：${route.person.origin} → ${candidate.station}`,
      `  ${route.duration}分 / 乗換${route.transferCount}回 / ${formatClock(route.arrivalTime)}着`,
      ...formatLegsForText(route.legs, route.path).map((line) => `  ${line}`),
      ""
    );
  }

  if (!candidate.isDirectDestination) {
    lines.push(
      `合流後：${candidate.station} → ${state.destination.trim()}`,
      `約${candidate.onwardDuration}分`,
      ...formatLegsForText(candidate.onwardLegs, candidate.onwardPath).map((line) => `  ${line}`)
    );
  }

  return lines.join("\n");
}

function parseClock(value: string) {
  const [hours, minutes] = value.split(":").map((part) => Number.parseInt(part, 10));
  return hours * 60 + minutes;
}

function getCurrentClock() {
  const now = new Date();
  return `${now.getHours().toString().padStart(2, "0")}:${now
    .getMinutes()
    .toString()
    .padStart(2, "0")}`;
}

function formatClock(totalMinutes: number) {
  const normalized = ((totalMinutes % 1440) + 1440) % 1440;
  const hours = Math.floor(normalized / 60)
    .toString()
    .padStart(2, "0");
  const minutes = (normalized % 60).toString().padStart(2, "0");
  return `${hours}:${minutes}`;
}

function buildShareableUrl(state: AppState) {
  if (typeof window === "undefined") return "";
  const params = stateToParams(state);
  return `${window.location.origin}${window.location.pathname}?${params.toString()}`;
}

function replaceUrlState(state: AppState) {
  if (typeof window === "undefined") return;
  window.history.replaceState(null, "", buildShareableUrl(state));
}

function stateToParams(state: AppState) {
  const params = new URLSearchParams();
  params.set("destination", state.destination.trim());
  params.set("departureTime", state.departureTime);
  params.set("priority", state.priority);
  params.set(
    "people",
    JSON.stringify(
      state.people.map((person) => ({
        name: person.name.trim(),
        origin: person.origin.trim()
      }))
    )
  );
  return params;
}

function restoreStateFromUrl(): AppState | null {
  if (typeof window === "undefined") return null;

  const search = window.location.search || window.location.hash.replace(/^#/, "?");
  const params = new URLSearchParams(search);
  const destination = params.get("destination");
  const departureTime = params.get("departureTime");
  const priority = params.get("priority") as Priority | null;
  const peopleParam = params.get("people");

  if (!destination || !departureTime || !priority || !peopleParam) return null;
  if (!["balanced", "fast", "fair"].includes(priority)) return null;

  try {
    const parsedPeople = JSON.parse(peopleParam) as Array<{ name?: string; origin?: string }>;
    const people = parsedPeople
      .filter((person) => person.name && person.origin)
      .map((person, index) => ({
        id: `url-${index}`,
        name: person.name ?? "",
        origin: person.origin ?? ""
      }));

    if (people.length === 0) return null;
    return {
      destination,
      departureTime,
      priority,
      people
    };
  } catch {
    return null;
  }
}

async function copyToClipboard(text: string) {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Some in-app browsers expose Clipboard API but deny write permission.
    }
  }

  if (typeof document === "undefined") return;

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
}
