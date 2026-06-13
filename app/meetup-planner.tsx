"use client";

import {
  Copy,
  MapPin,
  Plus,
  Route,
  Search,
  Share2,
  Trash2,
  UsersRound
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type Priority = "balanced" | "fast" | "fair";

type Person = {
  id: string;
  name: string;
  origin: string;
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
};

type Candidate = {
  station: string;
  isDirectDestination: boolean;
  gatherTime: number;
  destinationTime: number;
  onwardDuration: number;
  onwardPath: string[];
  onwardLines: LineMeta[];
  waitingTotal: number;
  score: number;
  routes: RouteResult[];
};

type LineMeta = {
  operator: string;
  name: string;
  symbol: string;
  color: string;
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
  balanced: "移動時間バランス",
  fast: "目的地に早く着く",
  fair: "待ち時間少なめ"
};

const DEFAULT_STATE: AppState = {
  destination: "渋谷",
  departureTime: "",
  priority: "balanced",
  people: [
    { id: "p1", name: "あなた", origin: "ひばりヶ丘" },
    { id: "p2", name: "お相手", origin: "横浜" }
  ]
};

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
    stations: ["新宿", "池袋", "赤羽", "武蔵浦和", "大宮", "川越"]
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
    minutes: 3,
    stations: ["新宿", "下北沢", "登戸", "新百合ヶ丘", "町田", "相模大野", "海老名"]
  },
  {
    line: lineMeta("京王", "京王線", "KO", "#DD0077"),
    minutes: 3,
    stations: ["渋谷", "下北沢", "明大前", "調布", "府中", "分倍河原", "橋本"]
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

export function MeetupPlanner() {
  const [destination, setDestination] = useState(DEFAULT_STATE.destination);
  const [departureTime, setDepartureTime] = useState(DEFAULT_STATE.departureTime);
  const [currentClock, setCurrentClock] = useState("");
  const [priority, setPriority] = useState<Priority>(DEFAULT_STATE.priority);
  const [people, setPeople] = useState<Person[]>(DEFAULT_STATE.people);
  const [hasSearched, setHasSearched] = useState(false);
  const [toast, setToast] = useState("");
  const [liffClient, setLiffClient] = useState<LiffLike | null>(null);
  const [liffStatus, setLiffStatus] = useState("Webアプリ");

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
      setLiffStatus("LIFF ID未設定");
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
          setLiffStatus(liff.isInClient() ? "LIFFで起動中" : "Webで起動中");
        }
      } catch {
        if (!cancelled) {
          setLiffStatus("LIFF初期化失敗");
        }
      }
    }

    initializeLiff();

    return () => {
      cancelled = true;
    };
  }, []);

  const validationMessage = validateState(appState);
  const candidates = useMemo(
    () => (hasSearched && !validationMessage ? calculateCandidates(appState).slice(0, 5) : []),
    [appState, hasSearched, validationMessage]
  );

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
              <Route size={22} />
            </div>
            <div>
              <h1>集合先ナビ</h1>
              <p>大切な人との「どこ集合？」をすぐ決めます。</p>
            </div>
          </div>
          <span className="status-pill">
            <UsersRound size={15} />
            {liffStatus}
          </span>
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
              placeholder="例：渋谷"
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
                    placeholder="例：横浜"
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

          <datalist id="station-list">
            {stationNames.map((station) => (
              <option key={station} value={station} />
            ))}
          </datalist>
        </section>

        {hasSearched ? (
          <section className="results-panel" aria-label="検索結果">
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
              {toast}
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

                    <div className="route-list">
                      {candidate.routes.map((route) => (
                        <div className="route-item" key={route.person.id}>
                          <div className="route-title">
                            <strong>{route.person.name || "参加者"}</strong>
                            <span>
                              {route.duration}分 / {formatClock(route.arrivalTime)}着
                            </span>
                          </div>
                          <LineBadges lines={route.lines} />
                          <p className="route-path">{route.path.join(" → ")}</p>
                        </div>
                      ))}
                      {!candidate.isDirectDestination ? (
                        <div className="route-item">
                          <div className="route-title">
                            <strong>合流後</strong>
                            <span>約{candidate.onwardDuration}分</span>
                          </div>
                          <LineBadges lines={candidate.onwardLines} />
                          <p className="route-path">{candidate.onwardPath.join(" → ")}</p>
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
        ) : (
          <aside className="empty-state">
            <h2>駅名候補</h2>
            <div className="station-chips">
              {stationNames.slice(0, 20).map((station) => (
                <span className="chip" key={station}>
                  <MapPin size={12} />
                  {station}
                </span>
              ))}
            </div>
          </aside>
        )}
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
  const suggestions = useMemo(() => findStationSuggestions(value), [value]);
  const showSuggestions = focused && suggestions.length > 0;

  return (
    <div className={compact ? "field station-field compact-field" : "field station-field"}>
      {!compact ? <label htmlFor={id}>{label}</label> : null}
      <input
        id={id}
        className="input"
        list="station-list"
        aria-label={label}
        value={value}
        onBlur={() => window.setTimeout(() => setFocused(false), 120)}
        onChange={(event) => onChange(event.target.value)}
        onFocus={() => setFocused(true)}
        placeholder={placeholder}
      />
      {showSuggestions ? (
        <div className="suggestion-list">
          {suggestions.map((station) => (
            <button
              className="suggestion-item"
              key={station}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onChange(station);
                setFocused(false);
              }}
            >
              <MapPin size={14} />
              {station}
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

function findStationSuggestions(value: string) {
  const query = normalizeStation(value);
  if (!query) return stationNames.slice(0, 8);

  return stationNames
    .filter((station) => normalizeStation(station).includes(query))
    .slice(0, 8);
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
  if (!resolveStationName(state.destination)) return `行き先「${state.destination}」は現在の駅ネットワークにありません。`;
  if (!state.departureTime) return "出発時刻を入力してください。";
  if (state.people.length === 0) return "参加者を1人以上入力してください。";

  const emptyPerson = state.people.find((person) => !person.name.trim() || !person.origin.trim());
  if (emptyPerson) return "参加者の名前と現在地を入力してください。";

  const unknownOrigin = state.people.find((person) => !resolveStationName(person.origin));
  if (unknownOrigin) return `現在地「${unknownOrigin.origin}」は現在の駅ネットワークにありません。`;

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
        lines: linesForPath(path)
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
    const score = scoreCandidate(
      state.priority,
      destinationTime,
      waitingTotal,
      spread,
      gatherTime,
      isDirectDestination
    );

    candidates.push({
      station,
      isDirectDestination,
      gatherTime,
      destinationTime,
      onwardDuration,
      onwardPath: reconstructPath(destinationRoutes.previous, destination, station).reverse(),
      onwardLines: linesForPath(reconstructPath(destinationRoutes.previous, destination, station).reverse()),
      waitingTotal,
      score,
      routes
    });
  }

  return candidates.sort((a, b) => a.score - b.score || a.destinationTime - b.destinationTime);
}

function scoreCandidate(
  priority: Priority,
  destinationTime: number,
  waitingTotal: number,
  spread: number,
  gatherTime: number,
  isDirectDestination: boolean
) {
  const directBonus = isDirectDestination ? -8 : 0;
  if (priority === "fast") return destinationTime + waitingTotal * 0.1 + directBonus;
  if (priority === "fair") return destinationTime * 0.8 + spread * 3 + waitingTotal * 1.5 + directBonus;
  return destinationTime * 1.4 + gatherTime * 0.15 + waitingTotal * 0.6 + spread * 1.2 + directBonus;
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
          text: route.path.join(" → "),
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
                    text: `${candidate.onwardPath.join(" → ")} / 約${candidate.onwardDuration}分`,
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
      `  ${route.duration}分 / ${formatClock(route.arrivalTime)}着`,
      `  ${route.path.join(" → ")}`,
      ""
    );
  }

  if (!candidate.isDirectDestination) {
    lines.push(
      `合流後：${candidate.station} → ${state.destination.trim()}`,
      `約${candidate.onwardDuration}分`
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
