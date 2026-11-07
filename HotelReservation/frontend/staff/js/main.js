document.addEventListener("DOMContentLoaded", () => {
  const sidebar = document.getElementById("sidebar");
  const menuToggle = document.getElementById("menu-toggle");
  const backdrop = document.getElementById("sidebar-backdrop");
  const notificationButton = document.getElementById("notification-button");
  const notificationPanel = document.getElementById("notification-panel");
  const searchInput = document.getElementById("booking-search");
  const tableBody = document.getElementById("booking-table-body");
  const emptyState = document.getElementById("empty-state");
  const todayLabel = document.getElementById("today-label");
  const refreshButton = document.getElementById("refresh-button");

  // Hiển thị ngày hiện tại theo ngôn ngữ tiếng Việt.
  if (todayLabel) {
    todayLabel.textContent = new Intl.DateTimeFormat("vi-VN", {
      weekday: "long",
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    }).format(new Date());
  }

  const setSidebarOpen = (isOpen) => {
    sidebar?.classList.toggle("is-open", isOpen);
    if (menuToggle) menuToggle.setAttribute("aria-expanded", String(isOpen));
    if (backdrop) backdrop.hidden = !isOpen;
    document.body.classList.toggle("menu-open", isOpen);
  };

  menuToggle?.addEventListener("click", () => {
    const isOpen = menuToggle.getAttribute("aria-expanded") !== "true";
    setSidebarOpen(isOpen);
  });
  backdrop?.addEventListener("click", () => setSidebarOpen(false));

  // Đóng menu trên mobile sau khi chọn một mục điều hướng.
  document.querySelectorAll(".nav-link").forEach((link) => {
    link.addEventListener("click", () => {
      document.querySelectorAll(".nav-link").forEach((item) => {
        item.classList.remove("is-active");
        item.removeAttribute("aria-current");
      });
      link.classList.add("is-active");
      link.setAttribute("aria-current", "page");
      setSidebarOpen(false);
    });
  });

  notificationButton?.addEventListener("click", () => {
    const isExpanded = notificationButton.getAttribute("aria-expanded") === "true";
    notificationButton.setAttribute("aria-expanded", String(!isExpanded));
    if (notificationPanel) notificationPanel.hidden = isExpanded;
  });

  document.addEventListener("click", (event) => {
    if (
      notificationPanel &&
      notificationButton &&
      !notificationPanel.contains(event.target) &&
      !notificationButton.contains(event.target)
    ) {
      notificationPanel.hidden = true;
      notificationButton.setAttribute("aria-expanded", "false");
    }
  });

  // Tìm kiếm trực tiếp trong các dòng đặt phòng mẫu đang hiển thị.
  searchInput?.addEventListener("input", () => {
    const keyword = searchInput.value.trim().toLocaleLowerCase("vi");
    const rows = tableBody ? Array.from(tableBody.querySelectorAll("tr")) : [];
    let visibleCount = 0;

    rows.forEach((row) => {
      const matches = row.textContent.toLocaleLowerCase("vi").includes(keyword);
      row.hidden = !matches;
      if (matches) visibleCount += 1;
    });

    if (emptyState) emptyState.hidden = visibleCount !== 0;
  });

  // Làm mới ở bản giao diện tĩnh chỉ đưa trang về trạng thái ban đầu.
  refreshButton?.addEventListener("click", () => {
    if (searchInput) searchInput.value = "";
    if (tableBody) {
      tableBody.querySelectorAll("tr").forEach((row) => { row.hidden = false; });
    }
    if (emptyState) emptyState.hidden = true;
    refreshButton.innerHTML = '<span aria-hidden="true">✓</span> Đã làm mới';
    window.setTimeout(() => {
      refreshButton.innerHTML = '<span aria-hidden="true">↻</span> Làm mới giao diện';
    }, 1400);
  });
});
