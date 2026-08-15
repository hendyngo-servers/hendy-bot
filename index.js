<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Trung Tâm Khách Hàng - Hendy Cybertech</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
    <style>
        body {
            font-family: 'Plus Jakarta Sans', sans-serif;
            background-color: #0b0f19;
            color: #f3f4f6;
        }
        .glass-card {
            background: rgba(17, 24, 39, 0.75);
            backdrop-filter: blur(16px);
            border: 1px solid rgba(255, 255, 255, 0.08);
        }
        .neon-glow {
            box-shadow: 0 0 25px rgba(99, 102, 241, 0.15);
        }
        .tab-active {
            background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
            color: white;
            box-shadow: 0 4px 15px rgba(79, 70, 229, 0.4);
        }
    </style>
</head>
<body class="min-h-screen flex flex-col justify-between bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-gray-950 to-black">

    <div class="max-w-4xl w-full mx-auto p-4 sm:p-6 mt-4 sm:mt-8">
        <!-- HEADER PROFILE -->
        <div class="glass-card rounded-3xl p-6 sm:p-8 neon-glow relative overflow-hidden">
            <div class="absolute -right-10 -top-10 w-40 h-40 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none"></div>
            <div class="flex flex-col sm:flex-row items-center justify-between gap-6 relative z-10">
                <div class="flex items-center gap-4 text-center sm:text-left">
                    <div class="relative">
                        <div class="w-20 h-20 rounded-2xl bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center text-3xl font-bold shadow-lg shadow-indigo-500/30">
                            🐼
                        </div>
                        <span class="absolute -bottom-2 -right-2 bg-amber-500 text-black text-[10px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider shadow">VIP PRO</span>
                    </div>
                    <div>
                        <h1 id="user-name" class="text-2xl font-bold tracking-tight text-white">@Khách hàng</h1>
                        <p class="text-xs text-indigo-400 font-medium mt-1 flex items-center justify-center sm:justify-start gap-1.5">
                            <i class="fa-solid fa-id-badge"></i> ID Telegram: <span id="user-id" class="text-gray-300 font-mono">--</span>
                        </p>
                    </div>
                </div>

                <!-- WALLETS -->
                <div class="flex flex-row sm:flex-col gap-3 w-full sm:w-auto justify-center">
                    <div class="bg-gray-900/80 border border-gray-800 rounded-2xl px-5 py-3 text-center sm:text-right flex-1">
                        <span class="text-[11px] text-gray-400 uppercase tracking-wider block font-semibold">Ví Chính (Nạp)</span>
                        <span id="user-balance" class="text-lg sm:text-xl font-extrabold text-emerald-400 font-mono">0đ</span>
                    </div>
                    <div class="bg-gray-900/80 border border-gray-800 rounded-2xl px-5 py-3 text-center sm:text-right flex-1">
                        <span class="text-[11px] text-gray-400 uppercase tracking-wider block font-semibold">Ví Voucher</span>
                        <span id="user-voucher" class="text-lg sm:text-xl font-extrabold text-amber-400 font-mono">0đ</span>
                    </div>
                </div>
            </div>
        </div>

        <!-- STATS COUNTERS -->
        <div class="grid grid-cols-2 gap-4 mt-6">
            <div class="glass-card rounded-2xl p-5 text-center border-gray-800/80">
                <span class="text-xs text-gray-400 uppercase font-bold tracking-wider block mb-1">Tài khoản đã liên kết</span>
                <span id="count-linked" class="text-2xl sm:text-3xl font-extrabold text-indigo-400 font-mono">0</span>
            </div>
            <div class="glass-card rounded-2xl p-5 text-center border-gray-800/80">
                <span class="text-xs text-gray-400 uppercase font-bold tracking-wider block mb-1">Mã Code đã trúng</span>
                <span id="count-won" class="text-2xl sm:text-3xl font-extrabold text-emerald-400 font-mono">0</span>
            </div>
        </div>

        <!-- TABS -->
        <div class="flex gap-3 mt-6 bg-gray-900/60 p-1.5 rounded-2xl border border-gray-800">
            <button onclick="switchTab('linked')" id="btn-tab-linked" class="flex-1 py-3 rounded-xl font-bold text-sm transition-all duration-300 tab-active flex items-center justify-center gap-2">
                <i class="fa-solid fa-link"></i> Tài Khoản Liên Kết
            </button>
            <button onclick="switchTab('won')" id="btn-tab-won" class="flex-1 py-3 rounded-xl font-bold text-sm transition-all duration-300 text-gray-400 hover:text-white flex items-center justify-center gap-2">
                <i class="fa-solid fa-gift"></i> Lịch Sử Trúng Code
            </button>
        </div>

        <!-- CONTENT LINKED -->
        <div id="content-linked" class="mt-6 space-y-3"></div>

        <!-- CONTENT WON -->
        <div id="content-won" class="mt-6 space-y-3 hidden"></div>
    </div>

    <footer class="text-center py-6 text-xs text-gray-500 border-t border-gray-900 mt-10">
        HENDY CYBERTECH PRO &copy; 2026 - All Rights Reserved ❤️
    </footer>

    <script>
        const urlParams = new URLSearchParams(window.location.search);
        const name = urlParams.get('name') || 'Khách hàng';
        const id = urlParams.get('id') || 'N/A';
        const balance = parseInt(urlParams.get('balance') || '0');
        const voucher = parseInt(urlParams.get('voucher') || '0');
        
        let linkedList = [];
        let wonList = [];

        try {
            const rawLinked = urlParams.get('linked_list');
            if (rawLinked) linkedList = JSON.parse(decodeURIComponent(rawLinked));
        } catch (e) { console.error(e); }

        try {
            const rawWon = urlParams.get('won_list');
            if (rawWon) wonList = JSON.parse(decodeURIComponent(rawWon));
        } catch (e) { console.error(e); }

        document.getElementById('user-name').innerText = '@' + name;
        document.getElementById('user-id').innerText = id;
        document.getElementById('user-balance').innerText = balance.toLocaleString('vi-VN') + 'đ';
        document.getElementById('user-voucher').innerText = voucher.toLocaleString('vi-VN') + 'đ';
        
        document.getElementById('count-linked').innerText = linkedList.length;
        document.getElementById('count-won').innerText = wonList.length;

        // Render Linked Accounts
        const linkedContainer = document.getElementById('content-linked');
        if (linkedList.length === 0) {
            linkedContainer.innerHTML = `<div class="glass-card rounded-2xl p-8 text-center text-gray-500"><i class="fa-solid fa-folder-open text-3xl mb-2"></i><p>Chưa có tài khoản nào được liên kết.</p></div>`;
        } else {
            linkedContainer.innerHTML = linkedList.map((item, index) => `
                <div class="glass-card rounded-2xl p-4 flex items-center justify-between border-gray-800 hover:border-indigo-500/50 transition-all">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center font-bold font-mono">${index + 1}</div>
                        <div>
                            <span class="text-xs font-semibold px-2.5 py-1 rounded-lg bg-indigo-500/20 text-indigo-300 uppercase">${item.brand || 'HENDY'}</span>
                            <h3 class="text-base font-bold text-white mt-1 font-mono">${item.tk || 'N/A'}</h3>
                        </div>
                    </div>
                    <span class="text-xs font-semibold text-emerald-400 bg-emerald-500/10 px-3 py-1.5 rounded-xl border border-emerald-500/20 flex items-center gap-1.5">
                        <i class="fa-solid fa-circle-check"></i> Hoạt động
                    </span>
                </div>
            `).join('');
        }

        // Render Won Codes
        const wonContainer = document.getElementById('content-won');
        if (wonList.length === 0) {
            wonContainer.innerHTML = `<div class="glass-card rounded-2xl p-8 text-center text-gray-500"><i class="fa-solid fa-gift text-3xl mb-2"></i><p>Chưa có lịch sử trúng mã code.</p></div>`;
        } else {
            wonContainer.innerHTML = wonList.map((item, index) => `
                <div class="glass-card rounded-2xl p-4 flex items-center justify-between border-gray-800 hover:border-emerald-500/50 transition-all">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center font-bold font-mono">${index + 1}</div>
                        <div>
                            <span class="text-xs font-semibold px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 uppercase">${item.brand || 'SỰ KIỆN'}</span>
                            <h3 class="text-sm font-bold text-white mt-1 font-mono">TK: ${item.accountTk || 'N/A'}</h3>
                        </div>
                    </div>
                    <div class="text-right">
                        <span class="text-[10px] text-gray-400 uppercase block">Thưởng</span>
                        <span class="text-base font-black text-amber-400 font-mono">+${item.code || 0} Điểm</span>
                    </div>
                </div>
            `).join('');
        }

        function switchTab(tab) {
            const btnLinked = document.getElementById('btn-tab-linked');
            const btnWon = document.getElementById('btn-tab-won');
            const contentLinked = document.getElementById('content-linked');
            const contentWon = document.getElementById('content-won');

            if (tab === 'linked') {
                btnLinked.className = "flex-1 py-3 rounded-xl font-bold text-sm transition-all duration-300 tab-active flex items-center justify-center gap-2";
                btnWon.className = "flex-1 py-3 rounded-xl font-bold text-sm transition-all duration-300 text-gray-400 hover:text-white flex items-center justify-center gap-2";
                contentLinked.classList.remove('hidden');
                contentWon.classList.add('hidden');
            } else {
                btnWon.className = "flex-1 py-3 rounded-xl font-bold text-sm transition-all duration-300 tab-active flex items-center justify-center gap-2";
                btnLinked.className = "flex-1 py-3 rounded-xl font-bold text-sm transition-all duration-300 text-gray-400 hover:text-white flex items-center justify-center gap-2";
                contentWon.classList.remove('hidden');
                contentLinked.classList.add('hidden');
            }
        }
    </script>
</body>
</html>
