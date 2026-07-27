import type { Metadata } from "next";
import WaterWatch from "./water-watch";

export const metadata: Metadata = {
  title: { absolute: "Durham Water Watch" },
  description:
    "An unofficial independent community dashboard for Durham drinking-water reservoirs, drought conditions, and current water-use rules.",
};

export default function Home() {
  return <WaterWatch />;
}
