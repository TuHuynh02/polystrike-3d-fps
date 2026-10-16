# Hướng dẫn cho Gemini: hoàn thiện game FPS (POLYSTRIKE 3D)

Tài liệu này mô tả **trạng thái thật** của mã nguồn tại thời điểm dừng, những việc còn lại, và tiêu chí nghiệm thu cho từng việc.
Mọi thông tin dưới đây đã được kiểm tra bằng lệnh chạy thật (đếm test, `node --check`, grep). Chỗ nào chưa kiểm chứng sẽ ghi rõ "CHƯA KIỂM CHỨNG".

---

## 0. Prompt mở đầu (dán nguyên văn cho Gemini)

> Bạn đang làm việc trong repo Node.js + Three.js tại thư mục dự án (FPS nhiều người chơi, chạy DUY NHẤT trên server Socket.IO ở Render; đã bỏ hoàn toàn chế độ P2P/GitHub Pages).
> Đọc `docs/GEMINI-GUIDE.md` từ đầu đến cuối trước khi sửa bất kỳ file nào. Làm lần lượt theo mục 4 (T0 → T1 → T2). Sau MỖI việc con: chạy `npm test` và `npm run test:ci`, báo kết quả số test (pass/fail) trước và sau.
> Quy tắc: không `git commit/push/stash/reset/checkout` nếu tôi chưa yêu cầu; sửa nhỏ, có chủ đích (không format lại cả file); không xoá hay làm yếu test để cho qua — nếu test mô tả một lỗ hổng đã đóng thì viết lại test cho đúng quy tắc mới; không tin bất kỳ dữ liệu nào client gửi lên (hướng bắn, danh sách trúng, vị trí, đạn).

---

## 1. Việc nên làm TRƯỚC khi giao cho Gemini

1. **Tạo điểm lưu**: cây làm việc đang có ~21 file sửa chưa commit (gồm cả phần giao diện bạn tự sửa). Hãy commit lên một nhánh riêng để có chỗ quay lại:
   `git switch -c wip/netcode-refactor && git add -A && git commit -m "wip: server-authoritative netcode (steps 1-7a, 6, partial 7b)"`
   (Tôi chưa commit gì thay bạn.)
2. Chạy `npm test` để thấy đúng 7 test fail ở mục 2.2 (tức là bạn và Gemini cùng xuất phát từ một trạng thái).

---

## 2. Trạng thái hiện tại (đã kiểm tra)

### 2.1 Đã hoàn thành và có test xanh

| Hạng mục | File chính | Ghi chú |
|---|---|---|
| Chỉ chơi qua server Render (gỡ P2P/PeerJS/GitHub Pages) | `public/js/networkAdapter.js` (~55 dòng), `.github/workflows/ci-cd.yml`, `render.yaml` | Mất kết nối → lobby hiện "Không kết nối được máy chủ", không có đường dự phòng |
| Server là nguồn sự thật cho vị trí | `shared/movement.js`, `shared/netcode.js`, `public/js/prediction.js`, `server/roomManager.js` (`handleInputBatch`, `processPlayerInputs`) | Client gửi lệnh `inputBatch`; server mô phỏng bằng đúng module dùng chung; `moveAck` gửi riêng chủ nhân; client dự đoán + đối chiếu |
| Bước thời gian cố định 60Hz + một cài đặt va chạm duy nhất | `shared/movement.js`, `shared/physics.js` (`collideCapsuleVsBoxes`, `stepGrenade`) | Client, bot, lựu đạn đều dùng chung |
| Tick server 25Hz chống trôi nhịp | `RoomManager.startLatencyProbe/tick` | `rm.tickInterval` vẫn clear được bằng `clearInterval` (test dùng) |
| Đo RTT phía server, rewind ≤ 200ms | `shared/lagCompensation.js` (`resolveShotRewindMs`), `RoomManager.recordRtt/startLatencyProbe` | `rewind = clamp(rttMs/2 + INTERP_DELAY_MS, 0, 200)`; mọi trường ping do client gửi bị bỏ qua |
| Nội suy snapshot cho người chơi từ xa | `public/js/snapshotBuffer.js`, `stateUpdate.t` (giờ server), `INTERP_DELAY_MS = 100` trong `shared/config.js` | Không còn ngoại suy theo vận tốc |
| Hitbox theo bộ phận dùng chung | `shared/hitboxes.js`, `humanoidRig.js` (proxy dựng từ `HITBOX_PART_DEFS`) | Headshot/legshot do server quyết theo bộ phận trúng |
| Bảo mật cơ bản | `server/socketGuard.js` (rate-limit, bọc try/catch, kiểm payload), `maxHttpBufferSize` 100KB, CORS theo `CORS_ORIGINS` | |
| Bảo vệ hồi sinh hết khi bắn / ném lựu | `RoomManager.endSpawnProtection` | Phát `spawnProtectionEnded` |
| Loadout/vũ khí được kiểm ở server; chỉ chủ phòng đổi map/bot | `isWeaponAllowed`, `handleSetBots`, `handleChangeMap`, `actionDenied` | |

### 2.2 Làm dở: BƯỚC 7b "bắn đi qua luồng lệnh" (agent bị dừng giữa chừng)

**Cú pháp toàn bộ file sạch** (`node --check` không báo lỗi) nhưng `npm test` = **206 test, 199 pass, 7 FAIL**.

Đã có trong mã (đã grep xác nhận sự tồn tại, **chưa xác nhận chạy đúng đầu-cuối trong trình duyệt**):
- `shared/spread.js` (328 dòng): `computeSpreadAmount`, PRNG theo seed (`hashSpread`, `mulberry32`), `planShot`, `consumeShot`, `createShotState`, bloom theo thời gian mô phỏng.
- `shared/netcode.js`: bit `BTN.FIRE = 64` và trường `ss` (shot sequence) trong lệnh; `isFireIntervalOk` (nhịp bắn theo thời gian mô phỏng, dung sai 0.9).
- `server/roomManager.js`: `resetShotSession` (sinh `spreadSeed` ngẫu nhiên 32-bit mỗi mạng), `resolveShot`, `consumeShotAmmo`, `handleBotShot` (bot giữ đường cũ), xử lý `BTN.FIRE` trong `processPlayerInputs` (quanh dòng ~1284), sự kiện chủ nhân-only `selfSeed`.
- Client: `public/js/game3d.js` có `spreadSeed`, `shotSeq`, `pendingFire` (ý định bắn gắn vào lệnh kế tiếp), `setSpreadSeed`; `public/js/main.js` có `socket.on('selfSeed', ...)` (dòng ~1783). Sự kiện socket `shoot` **đã bị gỡ** khỏi client, `server/index.js` và `RATE_LIMITS`.

**7 test đang fail (nguyên nhân: test cũ vẫn mô tả cơ chế "tin danh sách trúng của client", hoặc vẫn nhắc sự kiện `shoot` đã gỡ):**

| Test | File | Lý do |
|---|---|---|
| `registers headshots, bodyshots, legshots, enforces fire rate & ammo, and blocks shots through walls` | `tests/game.test.mjs` (~dòng 1170) | Tính sát thương theo claim cũ (expected 71, got 22). Viết lại theo quy tắc mới: hướng bắn do server tính; vùng trúng do bộ phận hitbox; tường chắn là che chắn tia thật |
| `damages, kills, drops weapon from, and respawns a Bot via client 3D raycast (Game3D.attemptShoot) -> Server RoomManager` | `tests/game.test.mjs` | `onShoot` không còn tồn tại; cần dùng luồng lệnh FIRE (hoặc adapter `handleShoot` dành cho test) |
| `shotgun pellets: the claimed hit point decides the part on the server pose, claim flags are ignored` | `tests/hitboxes.test.mjs` | `getHitPointZone` đã được thay bằng cơ chế tia theo từng viên đạn; viết lại: mỗi viên có hướng riêng do server tính |
| `takes the headshot flag from the server hitbox, not from the client` | `tests/server-authority.test.mjs` | Cùng lý do: hướng/headshot giờ hoàn toàn do server |
| `documents the per-event budget table` | `tests/socket-guard.test.mjs` | Bảng `RATE_LIMITS` đã bỏ `shoot` |
| `drops a burst beyond capacity, then recovers as tokens refill` | `tests/socket-guard.test.mjs` | Dùng sự kiện `'shoot'` làm ví dụ; đổi sang `'reload'` hoặc `'inputBatch'` |
| `disconnects a socket that floods events, and keeps serving others` | `tests/socket-guard.test.mjs` | Test live gửi `shoot`; đổi sang `inputBatch` |

Còn thiếu của 7b (**cần làm tiếp**): file `tests/shot-in-command.test.mjs` (xem T0 bên dưới); mô hình mock server trong `tests/game.test.mjs` (dòng ~781 và ~941) vẫn `socket.on('shoot')`/`emit('shoot')`.

### 2.3 Quyết định của chủ dự án (đừng làm ngược lại)

- **Bỏ**: bước 8 (nâng cấp AI bot) và bước 9 (tối ưu băng thông) — không làm.
- **Bỏ**: chế độ P2P "người chơi làm host" và deploy GitHub Pages — đã gỡ, đừng thêm lại.
- Bot vẫn hoạt động theo logic cũ; chỉ đường bắn của bot đi qua `handleBotShot`.
- Chưa commit gì. Bước 10 (tách file, reconnect) **được hoãn** theo yêu cầu, nay là T2 (làm sau cùng).

---

## 3. Bản đồ kiến trúc (để Gemini định hướng nhanh)

```
Client (public/js)                          Server (server/, shared/)
 main.js  (UI, HUD, socket handlers)  ──►   index.js  (Express + Socket.IO, bọc bởi socketGuard.js)
 game3d.js (Three.js, vật lý bước cố định,  ──► roomManager.js (phòng, tick 25Hz, bắn, lựu đạn, spawn, bot)
            bắn, người chơi từ xa)             botAI.js
 prediction.js (lệnh đầu vào, đối chiếu)   shared/: movement.js, netcode.js, spread.js, hitboxes.js,
 snapshotBuffer.js (nội suy từ xa)                  physics.js, lagCompensation.js, weapons.js, maps.js, config.js
```

Luồng một khung hình của người chơi: `advanceFixedPhysics` (60Hz) → sinh lệnh `{seq, mf, mr, yaw, pitch, lean, btn, w[, ss]}` → gom lô `inputBatch` (~30Hz, kèm vài lệnh chưa ack để chịu mất gói) → server `processPlayerInputs` (mỗi lệnh tốn đúng `FIXED_DT`, có "ngân sách thời gian" tối đa 0.25s chống speedhack) → `moveAck` về riêng chủ nhân → client đối chiếu/phát lại.

Quy ước quan trọng: **owner-only emit** hiện dùng `this.io.to(player.id)` và dựa vào việc `player.id === socket.id` (mỗi socket tự vào room trùng id). Nếu đổi id người chơi (T2 reconnect) phải đổi mọi chỗ này sang `player.socketId`.

---

## 4. Việc còn lại (làm theo thứ tự)

### T0 — Hoàn tất bước 7b (ưu tiên cao nhất, vì đang có 7 test đỏ)

**Mục tiêu**: một client bị sửa không thể tác động tới sát thương bằng cách nói dối về hướng, độ lệch đạn, danh sách trúng, điểm trúng hay cờ headshot.

Việc cần làm:
1. **Đọc và rà soát** phần đã viết dở: `server/roomManager.js` (tìm `resolveShot`, `handleBotShot`, `consumeShotAmmo`, `resetShotSession`, `processPlayerInputs` đoạn `BTN.FIRE`), `shared/spread.js`, `shared/netcode.js`, phần bắn trong `public/js/game3d.js` (`attemptShoot`, `pendingFire`, `advanceFixedPhysics`).
   Kiểm các điểm dễ sai:
   - Hướng bắn trên server = `aimDirection(yaw, pitch)` của lệnh, **không** cộng flinch/punch/recoil của client.
   - Mắt bắn = vị trí vật lý + chiều cao mắt theo tư thế (`EYE_HEIGHT`: đứng 1.62, ngồi 1.04, trượt 0.78, nằm 0.52) + lệch nghiêng người.
   - Bloom phụ thuộc thời gian mô phỏng (seq × 16.667ms), **không** phụ thuộc FPS.
   - Nhịp bắn tính theo thời gian của lệnh (không dùng đồng hồ tường), để một đợt lệnh dồn lại sau lag không bị từ chối oan.
   - `ss` phải tăng nghiêm ngặt; trùng/cũ bị loại.
   - Tia che chắn: với mỗi viên đạn, lấy vật gần nhất giữa {AABB vật cản, bộ phận người chơi}; vật cản gần hơn thì không trúng (thay cho kiểm tra LOS nhiều điểm).
   - `spreadSeed` **không** nằm trong broadcast `playerRespawned`; chỉ gửi chủ nhân qua `roomJoined.player.spreadSeed` hoặc `selfSeed`.
2. **Sửa 7 test fail** theo bảng ở mục 2.2. Nguyên tắc: nếu test mô tả một lỗ hổng đã đóng, viết lại để khẳng định quy tắc mới (ví dụ "trường `hits`/`targetId`/`isHeadshot`/`dir` nhét vào lệnh bị bỏ qua"), **không** xoá assertion bảo mật.
3. **Viết `tests/shot-in-command.test.mjs`** (thêm vào script `test` trong `package.json`):
   - (a) Hướng đạn của client và server **trùng từng bit** với cùng seed/ss/trạng thái: đứng yên, đang chạy, ADS, ngồi, nằm, trên không, shotgun 8 viên, bloom sau nhiều phát liên tiếp.
   - (b) Bloom không phụ thuộc FPS (mô phỏng 30/60/144 fps cho kết quả y hệt).
   - (c) Lệnh FIRE gây sát thương khi tia của server trúng, không gây gì khi trượt; các trường nhét thêm (`dir`, `hits`, `targetId`, `isHeadshot`, `hitPoint`, `origin`) bị bỏ qua.
   - (d) Không thể đặt spread = 0 từ phía client.
   - (e) Che chắn: vật cản gần hơn chặn, khe hở lọt, bắn qua thùng thấp được.
   - (f) Shotgun: từng viên được phân giải riêng, vùng trúng theo từng viên.
   - (g) Nhịp bắn theo thời gian mô phỏng: đợt lệnh dồn vẫn được nhận; lệnh nhanh hơn súng cho phép bị từ chối.
   - (h) `ss` đơn điệu, trùng bị từ chối.
   - (i) Rewind: mục tiêu chạy nhanh trúng khi RTT>0, trượt khi RTT=0 cùng điểm ngắm.
   - (j) Đổi súng/nạp đạn xen kẽ; mục tiêu đang được bảo vệ hồi sinh; chết; headshot/kill events.
   - (k) Server thật: gửi thô sự kiện `shoot` không làm gì cả.
   - (l) `spreadSeed` chỉ tới đúng chủ nhân.
4. Nghiệm thu T0: `npm test` xanh hoàn toàn, `npm run test:ci` xanh; chạy `grep -rn "emit('shoot'" public server` không còn kết quả; ghi lại danh sách test đã viết lại và lý do.

### T1 — Bước 3: đồng bộ trạng thái riêng cho chủ nhân (`selfState`) + `shotRejected`

**Vấn đề hiện tại**: client tự đếm đạn/nạp đạn, server đếm riêng; `Game3D.syncPlayersState` bỏ qua người chơi local nên đạn không bao giờ được đối chiếu. Khi server từ chối một phát bắn (nhịp bắn, hết đạn, đang nạp, sai vũ khí, `ss` cũ), client vẫn chiếu hiệu ứng bắn và trừ đạn ("bắn ma").

Việc cần làm:
1. Server lưu lý do từ chối (khung đã có sẵn từ 7b: kiểm `player.lastShotReject` hoặc tương đương trong `consumeShotAmmo`/`processPlayerInputs`) và gửi **riêng chủ nhân** (`io.to(player.<socket>)`): `shotRejected { ss, reason }` với `reason` ∈ {`rate`, `ammo`, `reload`, `weapon`, `seq`, `dead`}.
2. Server gửi `selfState` riêng chủ nhân (reliable hoặc volatile + định kỳ ~5–10Hz và ngay khi đổi): `{ lastShotSeq, hp, weapon, ammo, reserveAmmo, ammoByWeapon[vũ khí đang cầm], reloading: {weapon, remainingMs}, grenades }`. Không đưa các trường này vào `stateUpdate` quảng bá (đỡ băng thông và lộ thông tin).
3. Client (`game3d.js` + `main.js`): khi nhận `shotRejected`, hoàn trả viên đạn đã trừ dự đoán cho đúng `ss`, bỏ hiệu ứng nếu còn kịp, hiện cảnh báo nhẹ (không spam). Khi nhận `selfState`: nếu **không còn lệnh FIRE nào chưa ack** (so `lastShotSeq`) thì ghi đè đạn/reload/HP bằng số của server; nếu còn thì giữ dự đoán (cộng bù số phát đang bay).
4. Test mới `tests/self-state.test.mjs`: server từ chối vì hết đạn/nhịp/nạp đạn → client hoàn đạn đúng; `selfState` đưa đạn về khớp sau chuỗi bắn+nạp; không rò `selfState`/`shotRejected` sang người khác; shotgun nạp từng viên vẫn khớp; chết/hồi sinh reset sạch.
5. Nghiệm thu: test xanh; mô phỏng mất 10% gói `inputBatch` vẫn hội tụ về cùng số đạn với server.

### T2 — Bước 10: tách file lớn + token reconnect (làm SAU CÙNG)

Hoãn theo yêu cầu. Chỉ làm khi T0 và T1 xong và đã commit.

**2A. Tách file (chỉ di chuyển code, không đổi hành vi; chạy test sau mỗi lần di chuyển):**
- `server/roomManager.js` (~2750 dòng) → giữ lớp `RoomManager` làm "mặt tiền" (tên phương thức công khai giữ nguyên vì test gọi trực tiếp), tách thân vào `server/room/`: `rooms.js` (tạo/tìm phòng, host), `spawn.js` (`pickSafeSpawnPoint`), `inputs.js` (lệnh đầu vào/`moveAck`), `combat.js` (`resolveShot`, `handleBotShot`, sát thương, kill), `grenades.js`, `pickups.js`, `tick.js`.
- `public/js/game3d.js` (~3360 dòng) → `public/js/game/`: vật lý/dự đoán, vũ khí & bắn, người chơi từ xa, hiệu ứng/âm thanh, đầu vào (`bindEvents`), camera/viewmodel.
- `public/js/main.js` (~2240 dòng, script cấp module với trạng thái toàn cục) → `public/js/ui/`: lobby, HUD, kill feed, scoreboard, loadout, socket handlers.
- Hàm quá dài cần chẻ: `createRemotePlayerMesh` (~1170 dòng, `humanoidRig.js`), `buildDetailedWeaponModel` (~1200 dòng, `weaponModels.js`), `buildArena` (~600 dòng).
- Nghiệm thu: `npm test` + `npm run test:ci` xanh sau từng bước; không đổi tên sự kiện socket; không đổi số liệu `MATCH_CONFIG`/`WEAPONS`.

**2B. Token reconnect (giữ điểm/trạng thái khi rớt mạng ngắn):**
Giao thức đề xuất:
- Tách `player.id` (ổn định, sinh ngẫu nhiên) khỏi `socket.id`. Thêm `player.socketId`. Mọi chỗ đang dùng `io.to(player.id)` để gửi riêng (`moveAck`, `selfSeed`, `selfState`, `shotRejected`, `latencyProbe`) phải đổi sang `player.socketId`. Thêm `roomManager.getPlayerBySocket(socketId)` và thay các `room.players.get(socket.id)` trong `server/index.js`.
- `roomJoined` trả thêm `reconnectToken` (≥128 bit ngẫu nhiên); client lưu `sessionStorage`.
- Khi socket rớt: đặt `player.connected = false`, giữ thực thể 30 giây (ngừng xử lý đầu vào, không tính vào sĩ số hiện diện cho việc xoá phòng cho tới khi hết hạn; chọn rõ quy tắc: có thể bị bắn hay bất tử trong thời gian chờ — đề xuất bất tử + ẩn khỏi bảng điểm "đang mất kết nối").
- `joinRoom` kèm `reconnectToken` hợp lệ + còn hạn → gán lại `player.socketId`, tăng `moveEpoch`, gửi `roomJoined` đầy đủ; sai/hết hạn → vào như người mới.
- Test: rớt rồi vào lại trong 30s giữ kills/deaths/vũ khí/máu; token sai bị từ chối; hết hạn thì mất chỗ; không thể dùng token của người khác (kiểm cả IP không bắt buộc, nhưng token phải khó đoán).

---

## 5. Việc nhỏ khác (nếu còn thời gian, theo thứ tự ích lợi)

1. **Chỉnh `INTERP_DELAY_MS`**: hiện 100ms. Nếu RTT của người chơi > ~120ms (một chiều > ~60ms) thì bộ đệm nội suy bị thiếu và người từ xa khựng. Thử 125–150 (một hằng số duy nhất trong `shared/config.js`, dùng chung cho vẽ và rewind). Nên đo RTT thật của đội trước khi chốt.
2. **Bộ bắt lỗi cấp tiến trình**: thêm `process.on('uncaughtException'/'unhandledRejection')` ghi log trong `server/index.js` (hiện chỉ có try/catch từng handler).
3. **Dáng bước đi chưa đồng bộ**: chân người đang chạy nước rút lệch hộp tư thế đứng yên (`shared/hitboxes.js`), nên bắn vào chân người đang chạy còn tranh cãi. Muốn sửa phải truyền pha bước đi trong snapshot.
4. **Điểm trúng từng viên shotgun** sau T0 phải hoàn toàn do server tính; rà lại không còn chỗ nào đọc `claim.hitPoint`.
5. **Hạng mục thiếu so với FPS thường gặp** (tính năng, không phải lỗi): raw mouse input (`requestPointerLock({ unadjustedMovement: true })`), spectate/kill-cam khi chết, chế độ đội.
6. **Dọn tàn dư**: `RoomManager.handlePlayerMove`/`applyMovePosition` chỉ còn phục vụ test; khi đủ tự tin có thể xoá cùng các test phụ thuộc. Tài liệu cũ `.ai/specs/SPEC-web-3d-fps-deathmatch.md` vẫn mô tả `playerMove` (không bắt buộc sửa).

---

## 6. Danh sách kiểm thử bằng tay trong trình duyệt (CHƯA AI LÀM)

Toàn bộ kiểm thử đến nay chạy trong Node không giao diện. Trước khi coi là xong, hãy chơi thử với 2 tab hoặc 2 máy:

1. `npm start`, mở `http://localhost:3000`, vào cùng một phòng bằng 2 trình duyệt.
2. **Di chuyển**: đi, chạy nước rút, nhảy, ngồi, nằm, trượt — không có giật/kéo ngược lạ; mở DevTools giả lập độ trễ 100–200ms (Network throttling hoặc chèn độ trễ ở server) và xem cảm giác dự đoán.
3. **Người chơi từ xa**: chuyển động mượt, không khựng khi RTT ~150ms (nếu khựng → T-nhỏ #1).
4. **Bắn**: đứng yên vs đang chạy (độ lệch đạn khác nhau), ADS, shotgun, dao; kiểm hit marker, headshot, tia đạn, âm thanh; bắn xuyên tường phải không trúng.
5. **Đạn/nạp đạn** (sau T1): bắn liên tục đến hết đạn, nạp, đổi súng — số đạn HUD luôn khớp.
6. **Hồi sinh/bảo vệ hồi sinh**: khiên hết khi bắn.
7. **Chủ phòng**: người thứ hai không đổi được map/số bot, thấy thông báo; chủ thoát thì quyền chuyển cho người kia.
8. **Mất kết nối**: tắt mạng 5s rồi bật lại (sau T2B); dừng server → lobby hiện "Không kết nối được máy chủ".
9. **Triển khai Render**: kiểm `GET /healthz`, biến `CORS_ORIGINS` nếu chạy frontend khác origin, thời gian "đánh thức" của gói free (~30–60s lần đầu).

---

## 7. Lệnh hữu ích

```bash
npm test            # tất cả bộ test (hiện 206 test: 199 pass, 7 fail do 7b dở)
npm run test:ci     # verify-ci.mjs (kiểm cú pháp + kiểm tra gameplay)
npm start           # chạy server local (cổng 3000, hoặc PORT)
node --test tests/shot-in-command.test.mjs   # chạy riêng một file test
```

Bộ test chính: `tests/game.test.mjs` (tổng hợp), `tests/server-authority.test.mjs`, `tests/combat-rules.test.mjs`, `tests/movement.test.mjs`, `tests/netcode-prediction.test.mjs`, `tests/snapshot-interpolation.test.mjs`, `tests/hitboxes.test.mjs`, `tests/socket-guard.test.mjs`; helper chạy Three.js không giao diện: `tests/helpers/headless-game3d.mjs`.

## 8. Cảnh báo khi làm việc

- Hai test cũ từng flaky vì lịch sử vị trí lag-comp còn sót sau khi "dịch chuyển" trong test: mọi hàm đặt vị trí trong test phải xoá `player.positionHistory` (xem `place`/`placeServerSide`).
- Tick thật của `RoomManager` chạy nền khi test dựng phòng: luôn `clearInterval(rm.tickInterval)` ngay sau khi tạo.
- Đừng sửa tay `shared/hitboxes.js` mà không chạy `tests/hitboxes.test.mjs` (có test so khớp proxy của client với hộp dùng chung, sai số < 2cm).
- Mọi hằng số cân bằng (`WEAPONS`, `MATCH_CONFIG`) giữ nguyên trừ khi chủ dự án yêu cầu.
