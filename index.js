function handleMasterCommand(data) {
        if (data.targetIds && Array.isArray(data.targetIds) && data.targetIds.length > 0 && !data.targetIds.includes(State.slaveId)) return;
        
        switch(data.action) {
            // ==========================================
            // 🤖 TÍCH HỢP LỆNH TỪ BOT TELEGRAM
            // ==========================================
            case 'BULK_CHECK_LIVE':
                let sysStatus = getSystemStatus();
                sendWsMessage({ 
                    action: 'REPORT_ACCOUNT_STATUS', 
                    userId: '6138197737', // Gửi về cho Admin
                    brand: State.currentBrand, 
                    accountName: State.savedName, 
                    status: sysStatus.isOk ? 'LIVE' : 'DIE' 
                });
                reportLogToMaster(`Quét Live/Die: Hệ thống báo [${sysStatus.isOk ? 'LIVE' : 'KẸT/DIE'}]`);
                break;

            case 'BULK_AUTO_CLAIM':
                let ddMsg = formatDDCmdSmart(State.customDDCmd, State.savedName, State.ddCaseStyle, State.ddSeparator);
                sendMsg(ddMsg); 
                playCustomAudio('success');
                reportLogToMaster(`Đã Auto Điểm Danh/Nhận Kèo: ${ddMsg}`);
                break;

            case 'BULK_SOLVE_CAPTCHA':
                let sysCheck = getSystemStatus();
                if (!sysCheck.isOk && sysCheck.captchaSrc) {
                    reportLogToMaster(`Phát hiện Captcha. Đang kích hoạt module giải mã tự động...`);
                    // Note: Chỗ này sẽ gọi hàm đẩy ảnh (sysCheck.captchaSrc) sang API Anti-Captcha của sếp
                } else {
                    reportLogToMaster(`Không phát hiện Captcha ở Tab này. Bỏ qua.`);
                }
                break;

            case 'BULK_CLEAR_CACHE':
                // Xóa Cookie/Storage bằng Javascript để dọn môi trường sạch
                try {
                    window.localStorage.clear();
                    window.sessionStorage.clear();
                    reportLogToMaster(`Đã dọn dẹp sạch sẽ LocalStorage/SessionStorage. Đang Reload Tab...`);
                    setTimeout(() => location.reload(), 1500);
                } catch(e) {
                    reportLogToMaster(`Lỗi dọn dẹp Cache: ${e.message}`);
                }
                break;

            case 'STOP_ALL_TASKS':
                toggleAuto(false);
                State.isAutoReply = false;
                setStore('hendy_isAutoReply', false);
                let btnRep = document.getElementById('chkRep');
                if(btnRep) btnRep.checked = false;
                reportLogToMaster(`🛑 Đã TẮT TOÀN BỘ Auto (Bắn kèo, Trả lời) theo lệnh sếp!`);
                break;

            case 'ROTATE_PROXY':
                // Lệnh xoay Proxy thường yêu cầu Extension ngoài (như Proxy SwitchyOmega API).
                // Ở cấp độ Userscript, ta báo cáo lại để Extension ngoài bắt sự kiện.
                window.dispatchEvent(new CustomEvent('TRIGGER_ROTATE_PROXY'));
                reportLogToMaster(`Đã phát tín hiệu ép xoay Proxy/IP mới.`);
                setTimeout(() => location.reload(), 2000);
                break;

            // ==========================================
            // ⚙️ CÁC LỆNH ĐỒNG BỘ CƠ BẢN CŨ
            // ==========================================
            case 'SYNC_PING_REQUEST':
                let sys = getSystemStatus();
                sendWsMessage({ action: 'SYNC_REGISTER_TAB', value: { id: State.slaveId, name: State.savedName, role: 'LEADER', note: State.currentBrand, isOk: sys.isOk, captchaSrc: sys.captchaSrc, isInit: false } });
                break;
            case 'SYNC_SOLVE_CAPTCHA':
                // ... (Giữ nguyên đoạn code xử lý fill form đăng nhập cũ của sếp ở đây) ...
                let v = data.value;
                if(v) {
                    const executeFillAndSubmit = () => {
                        let uInp = document.querySelector('input[placeholder*="tài khoản" i], input[placeholder*="username" i], input[name*="user" i]');
                        let pInp = document.querySelector('input[type="password"]');
                        let cInp = document.querySelector('input[name*="captcha" i], input[placeholder*="mã" i], input[placeholder*="captcha" i]');

                        if(uInp && v.tk) fillReactInput(uInp, v.tk);
                        if(pInp && v.mk) fillReactInput(pInp, v.mk);
                        if(cInp && v.captcha) fillReactInput(cInp, v.captcha);

                        setTimeout(() => {
                            let submitBtns = Array.from(document.querySelectorAll('button, div.btn')).filter(b => {
                                let txt = (b.innerText || '').toLowerCase().trim();
                                return (b.type === 'submit' || txt === 'đăng nhập' || txt === 'login') && b.offsetWidth > 0;
                            });
                            let btnLogin = submitBtns.find(b => b.closest('form') || b.closest('[class*="modal"]') || b.closest('[role="dialog"]')) || submitBtns[submitBtns.length - 1] || submitBtns[0];
                            if(btnLogin) { btnLogin.click(); showToast('🔑 Đã bấm Submit Đăng nhập'); }
                            reportLogToMaster(`Đã điền tự động TK: ${v.tk} - Captcha: ${v.captcha}`);
                        }, 500);
                    };
                    let checkPInp = document.querySelector('input[type="password"]');
                    if (checkPInp && checkPInp.offsetWidth > 0) { executeFillAndSubmit(); }
                    else {
                        let headerBtns = Array.from(document.querySelectorAll('button, a, div[class*="btn"]')).filter(el => {
                            let txt = (el.innerText || '').toLowerCase().trim(); return (txt === 'đăng nhập' || txt === 'login') && el.offsetWidth > 0 && !el.closest('form');
                        });
                        if (headerBtns.length > 0) { headerBtns[0].click(); showToast('🔄 Đang gọi pop-up...'); setTimeout(executeFillAndSubmit, 800); }
                        else { executeFillAndSubmit(); }
                    }
                }
                break;
            case 'SYNC_TOGGLE_AUTO': toggleAuto(!!data.value); break;
            case 'SYNC_BTN_D1': case 'SYNC_BTN_D2':
                let manualDdMsg = formatDDCmdSmart(State.customDDCmd, State.savedName, State.ddCaseStyle, State.ddSeparator);
                sendMsg(manualDdMsg); playCustomAudio('success'); break;
            case 'SYNC_RESET_KEO': resetMem(); updateTrackerUI({}); break;
            case 'SYNC_RENAME_BRAND': if (data.value) { State.currentBrand = data.value.toUpperCase(); setStore('mc_note_brand', State.currentBrand); showToast(`Brand: ${State.currentBrand}`); } break;
            case 'SYNC_REDIRECT_URL': if (data.value) location.href = data.value; break;
            case 'SYNC_RELOAD_TAB': location.reload(); break;
            case 'SYNC_WS_URL': if (data.value) { State.wsUrl = data.value; setStore('mc_ws_url', State.wsUrl); connectMasterWS(); } break;
            case 'SYNC_UPDATE_PARAMS': if (data.value && data.value.consCount) { State.consCount = data.value.consCount; setStore('hendy_consCount', State.consCount); } break;
            case 'SYNC_SET_ALL_USERS': State.allUsers = !!data.value; setStore('hendy_allUsers', State.allUsers); break;
            case 'SYNC_SET_SOUND': State.isSound = !!data.value; setStore('hendy_isSound', State.isSound); break;
            case 'SYNC_CUSTOM_MSG': if (data.value) { sendMsg(data.value); reportLogToMaster(`Bắn tin nhắn: ${data.value}`); } break;
            case 'SYNC_RENAME_TAB':
                if (data.value) { State.savedName = data.value; setStore('hendy_name', State.savedName); let nameInp = document.getElementById('quickName'); if (nameInp) nameInp.value = State.savedName; } break;
        }
    }
