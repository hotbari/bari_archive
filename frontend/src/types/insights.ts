export interface InsightTheme {
  name: string;
  description: string;
}

export interface InsightData {
  portrait: string;
  themes: InsightTheme[];
  emerging: string;
  blind_spots: string;
  connection: string;
  total_links: number;
  generated_at: string;
}
