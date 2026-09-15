# CodeYang 鏈€浣冲疄璺垫寚鍗?
**鐗堟湰**: 1.0  
**鏇存柊鏃堕棿**: 2026-09-12

---

## 馃搵 鐩綍

1. [浠ｇ爜璐ㄩ噺鏈€浣冲疄璺礭(#浠ｇ爜璐ㄩ噺鏈€浣冲疄璺?
2. [瀹夊叏鏈€浣冲疄璺礭(#瀹夊叏鏈€浣冲疄璺?
3. [鎬ц兘鏈€浣冲疄璺礭(#鎬ц兘鏈€浣冲疄璺?
4. [鍥㈤槦鍗忎綔鏈€浣冲疄璺礭(#鍥㈤槦鍗忎綔鏈€浣冲疄璺?
5. [宸ヤ綔娴佹渶浣冲疄璺礭(#宸ヤ綔娴佹渶浣冲疄璺?

---

## 浠ｇ爜璐ㄩ噺鏈€浣冲疄璺?
### 1. 娴嬭瘯椹卞姩寮€鍙?(TDD)

**鎺ㄨ崘鍋氭硶**:
```
浣? 鎴戦渶瑕佸垱寤轰竴涓敤鎴烽獙璇佸嚱鏁般€傚厛鍐欐祴璇曘€?# CodeYang 鍒涘缓娴嬭瘯
浣? 鐜板湪瀹炵幇杩欎釜鍑芥暟浣挎祴璇曢€氳繃銆?```

**濂藉**:
- 鉁?鏇存竻鏅扮殑闇€姹傚畾涔?- 鉁?鏇撮珮鐨勬祴璇曡鐩栫巼
- 鉁?鏇村皯鐨?bug

### 2. 浠ｇ爜瀹℃煡娴佺▼

**姣忔閲嶈鏇存敼鍚?*:
```
浣? 瀹℃煡鍒氭墠鐨勬洿鏀癸紝妫€鏌ワ細
    1. 浠ｇ爜椋庢牸鏄惁涓€鑷?    2. 鏄惁鏈夋綔鍦?bug
    3. 鏄惁鏈夋€ц兘闂
    4. 鏄惁鏈夊畨鍏ㄩ殣鎮?```

### 3. 鎸佺画闆嗘垚

**寤鸿宸ヤ綔娴?*:
1. 鏈湴寮€鍙?2. 杩愯娴嬭瘯: `浣? 杩愯鎵€鏈夋祴璇昤
3. 浠ｇ爜瀹℃煡: `浣? 瀹℃煡鏇存敼`
4. 鎻愪氦: `浣? 鎻愪氦鏇存敼锛屾秷鎭负 "feat: add feature"`
5. 鎺ㄩ€佸墠鍐嶆娴嬭瘯

### 4. 鏂囨。鍏堣

**鍒涘缓鏂板姛鑳芥椂**:
```
浣? 鍏堝垱寤?API 鏂囨。锛屾弿杩版柊鍔熻兘鐨勬帴鍙?# 瀹℃煡骞剁‘璁ゆ枃妗?浣? 鏍规嵁鏂囨。瀹炵幇鍔熻兘
浣? 涓烘枃妗ｄ腑鐨勬瘡涓?API 缂栧啓娴嬭瘯
```

### 5. 閲嶆瀯绛栫暐

**瀹夊叏閲嶆瀯鐨勬楠?*:
```
浣? 绗竴姝ワ細涓鸿閲嶆瀯鐨勪唬鐮佹坊鍔犳祴璇曪紙濡傛灉娌℃湁锛?# 纭娴嬭瘯閫氳繃
浣? 绗簩姝ワ細杩涜閲嶆瀯
# 杩愯娴嬭瘯
浣? 绗笁姝ワ細纭鎵€鏈夋祴璇曚粛鐒堕€氳繃
```

---

## 瀹夊叏鏈€浣冲疄璺?
### 1. 杈撳叆楠岃瘉

**濮嬬粓楠岃瘉鐢ㄦ埛杈撳叆**:
```typescript
// 鉁?濂界殑鍋氭硶
import { validateFilePath, validateUrl } from './utils/inputValidation.js';

function readUserFile(path: string) {
  if (!validateFilePath(path)) {
    throw new Error('Invalid file path');
  }
  return fs.readFileSync(path);
}

// 鉂?涓嶅ソ鐨勫仛娉?function readUserFile(path: string) {
  return fs.readFileSync(path); // 璺緞閬嶅巻椋庨櫓
}
```

### 2. 鏁忔劅鏁版嵁淇濇姢

**涓嶈鍦ㄦ棩蹇椾腑璁板綍鏁忔劅淇℃伅**:
```typescript
// 鉁?濂界殑鍋氭硶
import { redactSensitiveData } from './utils/inputValidation.js';

logger.info('User login', redactSensitiveData({
  username: 'john',
  password: 'secret123', // 浼氳閬斀
}));

// 鉂?涓嶅ソ鐨勫仛娉?logger.info('User login', { username, password }); // 瀵嗙爜娉勯湶
```

### 3. API 瀵嗛挜绠＄悊

**浣跨敤鐜鍙橀噺**:
```bash
# 鉁?濂界殑鍋氭硶
# .env
API_KEY=your-secret-key

# 鉂?涓嶅ソ鐨勫仛娉?# 鐩存帴鍦ㄤ唬鐮佷腑
const apiKey = 'sk-1234567890abcdef';
```

**涓嶈鎻愪氦 .env**:
```bash
# .gitignore
.env
.env.local
```

### 4. HTTPS 鍜屽畨鍏ㄩ€氫俊

```typescript
// 鉁?濂界殑鍋氭硶
const url = 'https://api.example.com'; // 浣跨敤 HTTPS

// 鉂?涓嶅ソ鐨勫仛娉?const url = 'http://api.example.com'; // 涓嶅畨鍏?```

### 5. 渚濊禆瀹夊叏

**瀹氭湡瀹¤渚濊禆**:
```bash
# 姣忓懆杩愯
npm audit

# 淇婕忔礊
npm audit fix

# 妫€鏌ヨ繃鏈熶緷璧?npm outdated
```

### 6. 鏈€灏忔潈闄愬師鍒?
```typescript
// 鉁?濂界殑鍋氭硶
// 鍙鍙栭渶瑕佺殑鏂囦欢
const config = readFile('config.json');

// 鉂?涓嶅ソ鐨勫仛娉?// 缁欎簣杩囧鏉冮檺
const allFiles = readDir('/');
```

---

## 鎬ц兘鏈€浣冲疄璺?
### 1. 缂撳瓨绛栫暐

**浣跨敤 LRU 缂撳瓨**:
```typescript
import { LRUCache } from './utils/lruCache.js';

const cache = new LRUCache(100); // 鏈€澶?100 椤?
function expensiveOperation(key: string) {
  const cached = cache.get(key);
  if (cached) return cached;
  
  const result = doExpensiveWork(key);
  cache.set(key, result);
  return result;
}
```

### 2. 寮傛鎿嶄綔

**骞惰鎵ц鐙珛浠诲姟**:
```typescript
// 鉁?濂界殑鍋氭硶 - 骞惰
const [user, posts, comments] = await Promise.all([
  fetchUser(id),
  fetchPosts(id),
  fetchComments(id),
]);

// 鉂?涓嶅ソ鐨勫仛娉?- 涓茶
const user = await fetchUser(id);
const posts = await fetchPosts(id);
const comments = await fetchComments(id);
```

### 3. 鍐呭瓨绠＄悊

**閬垮厤鍐呭瓨娉勬紡**:
```typescript
// 鉁?濂界殑鍋氭硶
class EventEmitter {
  listeners = new WeakMap(); // 鑷姩鍨冨溇鍥炴敹
}

// 鉂?涓嶅ソ鐨勫仛娉?const globalCache = {}; // 姘镐笉閲婃斁
```

### 4. 鎵归噺鎿嶄綔

**鎵归噺澶勭悊鏁版嵁**:
```typescript
// 鉁?濂界殑鍋氭硶
const results = await Promise.all(
  items.slice(0, 10).map(processItem)
);

// 鉂?涓嶅ソ鐨勫仛娉?for (const item of thousandsOfItems) {
  await processItem(item); // 涓茶锛屽緢鎱?}
```

### 5. 鎳掑姞杞?
**鎸夐渶鍔犺浇妯″潡**:
```typescript
// 鉁?濂界殑鍋氭硶
async function handleQt() {
  const qt = await import('./qt/index.js');
  return qt.detectQtProject();
}

// 鉂?涓嶅ソ鐨勫仛娉?import * as qt from './qt/index.js'; // 鎬绘槸鍔犺浇
```

---

## 鍥㈤槦鍗忎綔鏈€浣冲疄璺?
### 1. 浠ｇ爜瑙勮寖

**浣跨敤缁熶竴鐨勪唬鐮侀鏍?*:
```bash
# 瀹夎宸ュ叿
npm install -D eslint prettier

# 杩愯妫€鏌?npm run lint
npm run format
```

**鍦?CLAUDE.md 涓畾涔夎鑼?*:
```markdown
# 浠ｇ爜瑙勮寖

- 浣跨敤 2 绌烘牸缂╄繘
- 浣跨敤鍗曞紩鍙?- 姣忚鏈€澶?100 瀛楃
- 鍑芥暟鍚嶄娇鐢?camelCase
- 绫诲悕浣跨敤 PascalCase
```

### 2. 鎻愪氦瑙勮寖

**浣跨敤 Conventional Commits**:
```bash
feat: 娣诲姞鏂板姛鑳?fix: 淇 bug
docs: 鏇存柊鏂囨。
style: 浠ｇ爜鏍煎紡鍖?refactor: 閲嶆瀯浠ｇ爜
test: 娣诲姞娴嬭瘯
chore: 鏋勫缓/宸ュ叿鍙樻洿
```

### 3. 鍒嗘敮绛栫暐

**Git Flow 宸ヤ綔娴?*:
```
main          # 鐢熶骇鍒嗘敮
  鈹斺攢 develop  # 寮€鍙戝垎鏀?      鈹溾攢 feature/user-auth    # 鍔熻兘鍒嗘敮
      鈹溾攢 feature/api-v2
      鈹斺攢 bugfix/login-error   # 淇鍒嗘敮
```

**绀轰緥**:
```
浣? 鍒涘缓鏂板垎鏀?feature/user-profile
浣? 瀹炵幇鐢ㄦ埛涓汉璧勬枡鍔熻兘
浣? 鎻愪氦鎵€鏈夋洿鏀?浣? 鍒囨崲鍥?develop 鍒嗘敮
浣? 鍚堝苟 feature/user-profile
```

### 4. 浠ｇ爜瀹℃煡娓呭崟

鍦ㄥ悎骞跺墠妫€鏌ワ細
- [ ] 鎵€鏈夋祴璇曢€氳繃
- [ ] 浠ｇ爜瑕嗙洊鐜囨病鏈変笅闄?- [ ] 娌℃湁 linter 璀﹀憡
- [ ] 鏂囨。宸叉洿鏂?- [ ] 娌℃湁閬楃暀鐨?TODO 鎴?console.log
- [ ] 鎬ц兘娌℃湁鏄捐憲涓嬮檷

### 5. 鏂囨。缁存姢

**淇濇寔鏂囨。鍚屾**:
```
浣? 姣忔 API 鍙樻洿鍚庯紝鍚屾椂鏇存柊锛?    1. API 鏂囨。
    2. README.md
    3. 鍙樻洿鏃ュ織
    4. 绫诲瀷瀹氫箟
```

---

## 宸ヤ綔娴佹渶浣冲疄璺?
### 1. 鏅ㄩ棿鍚姩娴佺▼

```
浣? 鎷夊彇鏈€鏂颁唬鐮?浣? 瀹夎鏂扮殑渚濊禆锛堝鏋滄湁锛?浣? 杩愯娴嬭瘯纭繚鐜姝ｅ父
浣? 鏌ョ湅浠婂ぉ鐨勪换鍔″垪琛?```

### 2. 鍔熻兘寮€鍙戞祦绋?
**瀹屾暣鐨勫姛鑳藉紑鍙戝懆鏈?*:

```
# 1. 瑙勫垝
浣? 鍒涘缓鍔熻兘璁捐鏂囨。 docs/features/user-auth.md

# 2. 鍒嗘敮
浣? 鍒涘缓鍒嗘敮 feature/user-auth

# 3. 娴嬭瘯鍏堣
浣? 涓虹敤鎴疯璇佸垱寤烘祴璇曟枃浠?
# 4. 瀹炵幇
浣? 瀹炵幇鐢ㄦ埛璁よ瘉鍔熻兘

# 5. 楠岃瘉
浣? 杩愯鎵€鏈夋祴璇?浣? 杩愯 linter
浣? 鎵嬪姩娴嬭瘯鍔熻兘

# 6. 鏂囨。
浣? 鏇存柊 API 鏂囨。
浣? 娣诲姞浣跨敤绀轰緥

# 7. 浠ｇ爜瀹℃煡
浣? 瀹℃煡浠ｇ爜璐ㄩ噺

# 8. 鎻愪氦
浣? 鎻愪氦鎵€鏈夋洿鏀癸紝娑堟伅涓?"feat: implement user authentication"

# 9. 鍚堝苟
浣? 鍒囨崲鍒?develop
浣? 鍚堝苟 feature/user-auth
浣? 鍒犻櫎鍔熻兘鍒嗘敮
```

### 3. Bug 淇娴佺▼

```
# 1. 閲嶇幇
浣? 鍒涘缓鏈€灏忓彲澶嶇幇绀轰緥

# 2. 娴嬭瘯
浣? 涓?bug 鍒涘缓澶辫触娴嬭瘯

# 3. 淇
浣? 淇 bug 浣挎祴璇曢€氳繃

# 4. 楠岃瘉
浣? 杩愯鎵€鏈夋祴璇?浣? 鎵嬪姩楠岃瘉淇

# 5. 鍥炲綊娴嬭瘯
浣? 杩愯鐩稿叧鍔熻兘鐨勬墍鏈夋祴璇?
# 6. 鏂囨。
浣? 鍦?CHANGELOG.md 涓褰曚慨澶?
# 7. 鎻愪氦
浣? 鎻愪氦锛屾秷鎭负 "fix: resolve login issue #123"
```

### 4. 閲嶆瀯娴佺▼

```
# 1. 璇勪及
浣? 鍒嗘瀽闇€瑕侀噸鏋勭殑浠ｇ爜
浣? 鍒楀嚭閲嶆瀯鐩爣

# 2. 娴嬭瘯瑕嗙洊
浣? 纭繚閲嶆瀯鍖哄煙鏈夎冻澶熸祴璇曡鐩?
# 3. 灏忔閲嶆瀯
浣? 杩涜灏忚寖鍥撮噸鏋?浣? 杩愯娴嬭瘯
浣? 鎻愪氦

# 閲嶅姝ラ 3 鐩村埌瀹屾垚

# 4. 鏈€缁堥獙璇?浣? 杩愯瀹屾暣娴嬭瘯濂椾欢
浣? 鎬ц兘娴嬭瘯
浣? 浠ｇ爜瀹℃煡
```

### 5. 鍙戝竷娴佺▼

```
# 1. 鍑嗗
浣? 妫€鏌ユ墍鏈夋祴璇曢€氳繃
浣? 鏇存柊鐗堟湰鍙?浣? 鏇存柊 CHANGELOG.md

# 2. 鏍囪
浣? 鍒涘缓 git tag v1.0.0
浣? 鎺ㄩ€?tag

# 3. 鏋勫缓
浣? 杩愯鐢熶骇鏋勫缓
浣? 杩愯瀹夊叏瀹¤

# 4. 鍙戝竷
浣? 鍙戝竷鍒?npm锛堝鏋滈€傜敤锛?浣? 鍒涘缓 GitHub release

# 5. 閫氱煡
浣? 鍙戝竷鍏憡
浣? 鏇存柊鏂囨。缃戠珯
```

---

## 椤圭洰缁存姢鏈€浣冲疄璺?
### 1. 瀹氭湡缁存姢浠诲姟

**姣忓懆**:
- [ ] 杩愯 `npm audit`
- [ ] 妫€鏌ヤ緷璧栨洿鏂?`npm outdated`
- [ ] 瀹℃煡鏈В鍐崇殑 issues
- [ ] 娓呯悊杩囨湡鍒嗘敮

**姣忔湀**:
- [ ] 鏇存柊涓昏渚濊禆
- [ ] 瀹℃煡娴嬭瘯瑕嗙洊鐜?- [ ] 鎬ц兘鍒嗘瀽
- [ ] 浠ｇ爜璐ㄩ噺瀹℃煡

**姣忓搴?*:
- [ ] 鎶€鏈€哄姟娓呯悊
- [ ] 鏋舵瀯瀹℃煡
- [ ] 鏂囨。瀹屾暣鎬ф鏌?- [ ] 瀹夊叏瀹¤

### 2. 鐩戞帶鍜屾棩蹇?
**浣跨敤缁撴瀯鍖栨棩蹇?*:
```typescript
logger.info('User action', {
  userId: user.id,
  action: 'login',
  timestamp: Date.now(),
  ip: req.ip,
});
```

**璁剧疆鍛婅**:
- 閿欒鐜囪秴杩囬槇鍊?- 鍝嶅簲鏃堕棿瓒呰繃闃堝€?- CPU/鍐呭瓨浣跨敤寮傚父

### 3. 澶囦唤绛栫暐

- 浠ｇ爜: Git + GitHub
- 鏁版嵁搴? 姣忔棩澶囦唤
- 閰嶇疆: 鐗堟湰鎺у埗
- 鏂囨。: Git + 瀹氭湡瀵煎嚭

---

## 甯歌闄烽槺鍙婇伩鍏嶆柟娉?
### 1. 杩囧害宸ョ▼

鉂?**閿欒鍋氭硶**:
```typescript
// 涓哄彧鏈?3 涓厤缃」鐨勯」鐩垱寤哄鏉傜殑閰嶇疆绯荤粺
class ConfigManager {
  private cache: LRUCache;
  private validator: ConfigValidator;
  private loader: ConfigLoader;
  // ... 500 琛屼唬鐮?}
```

鉁?**姝ｇ‘鍋氭硶**:
```typescript
// 绠€鍗曠殑閰嶇疆瀵硅薄
const config = {
  port: 3000,
  apiKey: process.env.API_KEY,
  debug: process.env.NODE_ENV === 'development',
};
```

### 2. 杩囨棭浼樺寲

鉂?**閿欒鍋氭硶**:
```typescript
// 鍦ㄦ病鏈夋€ц兘闂鏃跺氨寮曞叆澶嶆潅鐨勭紦瀛?const cache = new Redis({ /* ... */ });
```

鉁?**姝ｇ‘鍋氭硶**:
```typescript
// 鍏堝疄鐜板姛鑳斤紝鐒跺悗娴嬮噺鎬ц兘锛屽啀浼樺寲
function getUser(id) {
  return database.findById(id);
}
```

### 3. 蹇界暐閿欒澶勭悊

鉂?**閿欒鍋氭硶**:
```typescript
const data = JSON.parse(input); // 鍙兘鎶涘嚭寮傚父
```

鉁?**姝ｇ‘鍋氭硶**:
```typescript
try {
  const data = JSON.parse(input);
  return data;
} catch (error) {
  logger.error('JSON parse failed', { input, error });
  throw new ValidationError('Invalid JSON input');
}
```

### 4. 鍏ㄥ眬鐘舵€?
鉂?**閿欒鍋氭硶**:
```typescript
let currentUser; // 鍏ㄥ眬鍙橀噺

function login(user) {
  currentUser = user; // 澶氫釜璇锋眰浼氫簰鐩稿共鎵?}
```

鉁?**姝ｇ‘鍋氭硶**:
```typescript
class Session {
  constructor(private user: User) {}
  
  getUser() {
    return this.user;
  }
}
```

### 5. 宸ㄥぇ鐨勫嚱鏁?
鉂?**閿欒鍋氭硶**:
```typescript
function processUser(user) {
  // 200 琛屼唬鐮佸仛鍚勭浜嬫儏
}
```

鉁?**姝ｇ‘鍋氭硶**:
```typescript
function processUser(user) {
  validateUser(user);
  normalizeUser(user);
  saveUser(user);
  sendWelcomeEmail(user);
}
```

---

## 鎬ц兘浼樺寲妫€鏌ユ竻鍗?
### 鍓嶇鎬ц兘
- [ ] 鍘嬬缉璧勬簮 (gzip/brotli)
- [ ] 鎳掑姞杞藉浘鐗囧拰缁勪欢
- [ ] 浣跨敤 CDN
- [ ] 缂撳瓨闈欐€佽祫婧?- [ ] 浠ｇ爜鍒嗗壊

### 鍚庣鎬ц兘
- [ ] 鏁版嵁搴撶储寮曚紭鍖?- [ ] 鏌ヨ浼樺寲
- [ ] 浣跨敤杩炴帴姹?- [ ] 瀹炵幇缂撳瓨绛栫暐
- [ ] 寮傛澶勭悊闀夸换鍔?
### 閫氱敤浼樺寲
- [ ] 鍑忓皯缃戠粶璇锋眰
- [ ] 浣跨敤鎵归噺鎿嶄綔
- [ ] 瀹炵幇鍒嗛〉
- [ ] 鍘嬬缉鏁版嵁浼犺緭
- [ ] 鐩戞帶鍜屽垎鏋?
---

## 鎬荤粨

閬靛惊杩欎簺鏈€浣冲疄璺靛皢甯姪浣狅細
- 鉁?缂栧啓鏇撮珮璐ㄩ噺鐨勪唬鐮?- 鉁?鎻愰珮寮€鍙戞晥鐜?- 鉁?鍑忓皯 bug 鍜屽畨鍏ㄩ棶棰?- 鉁?鏀瑰杽鍥㈤槦鍗忎綔
- 鉁?淇濇寔椤圭洰鍋ュ悍

璁颁綇锛?*鏈€浣冲疄璺垫槸鎸囧锛屼笉鏄暀鏉°€傛牴鎹」鐩疄闄呮儏鍐电伒娲诲簲鐢ㄣ€?*

---

**鏂囨。鐗堟湰**: 1.0  
**鏈€鍚庢洿鏂?*: 2026-09-12  
**缁存姢鑰?*: CodeYang Team
