/**
 * 초기 버전의 메모리 저장소입니다.
 * 서버 코드는 Map 구현 대신 이 인터페이스만 사용하므로, 이후 같은 메서드를 가진
 * RedisRoomStore/DatabaseRoomStore로 교체할 수 있습니다.
 */
class MemoryRoomStore {
  constructor() {
    this.rooms = new Map();
  }

  get size() { return this.rooms.size; }
  get(code) { return this.rooms.get(code); }
  has(code) { return this.rooms.has(code); }
  set(code, room) { this.rooms.set(code, room); return this; }
  delete(code) { return this.rooms.delete(code); }
  values() { return this.rooms.values(); }
  clear() { this.rooms.clear(); }
}

module.exports = { MemoryRoomStore };
