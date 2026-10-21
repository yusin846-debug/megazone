import { Icon } from "./ui";

export default function NoContent() {
  return (
    <div className="callout y">
      <Icon id="i-lock" />
      <div>운영자 권한으로는 회의 내용(녹취록·문서)을 볼 수 없어요. 실행 상태 탭에서 진행 상황만 볼 수 있어요.</div>
    </div>
  );
}
