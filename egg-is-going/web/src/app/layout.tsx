import type { Metadata } from "next";
import "../styles/tokens.css";
import "../styles/app.css";
import Sprite from "@/components/Sprite";

export const metadata: Metadata = {
  title: "egg is going 제작회의 워크스페이스",
  description: "가상 제작사 대상 교육 프로젝트",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <Sprite />
        {children}
      </body>
    </html>
  );
}
