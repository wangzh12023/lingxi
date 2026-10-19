import { detectPublicity } from "../src/lib/engine/heuristics"
const cases: [string, number][] = [
  ["我已经发小红书了，评论区好多人说也这样", 3],
  ["我已经在黑猫投诉上发帖了，你们看着办", 3],
  ["昨天就发了微博，现在好多人转", 3],
  ["再不给我解决我就发小红书曝光你们", 2],
  ["客服态度这么差，我要发微博让大家看看", 2],
  ["不然我就去12315投诉，还要找媒体曝光", 2],
  ["小红书说你们家A醇超好用", 0],
  ["我是看了抖音直播买的", 0],
  ["微博上那个活动还有吗", 0],
  ["帮我看看快递到哪了", 0],
]
let bad = 0
for (const [text, want] of cases) {
  const got = detectPublicity(text)?.level ?? 0
  if (got !== want) bad++
  console.log(`${got === want ? "ok  " : "FAIL"} L${got} (want L${want})  ${text}`)
}
console.log(bad ? `${bad} FAILED` : "publicity: all pass")
process.exit(bad ? 1 : 0)
