/**
 * CHẾ ĐỘ GIAO DIỆN của người vừa là giáo viên vừa có vai trò quản trị (vd quản lý cơ sở kiêm dạy).
 *
 * - Giáo viên / trợ giảng thuần: LUÔN ở giao diện giáo viên — mọi trang họ mở (chấm công, học bạ,
 *   bài tập, tin nhắn…) đều nằm trong cùng khung giáo viên, không bị đẩy sang khung quản trị.
 * - Người kiêm nhiệm: vào /teacher là chuyển sang giao diện giáo viên (proxy ghi cookie), bấm
 *   "Chuyển sang khu quản trị" (/giao-dien?m=ql) là về khung quản trị. Cookie chỉ quyết định khung
 *   hiển thị, KHÔNG cấp hay bớt quyền — quyền vẫn kiểm ở service và hàng rào trang.
 */
export const GIAO_DIEN_COOKIE = "sr-giao-dien";

export function cheDoGiaoVien(o: { teacherOnly: boolean; isTeacher: boolean; cookie: string | undefined }): boolean {
  return o.teacherOnly || (o.isTeacher && o.cookie === "gv");
}
