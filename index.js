(function () {
    'use strict';

    // 이 확장은 채팅 데이터(chat 배열, chat.jsonl)에는 손대지 않습니다.
    // 오직 화면에 보이는 DOM(.mes_text)의 display 속성만 토글하고,
    // 접힘 상태는 브라우저 localStorage 에만 저장합니다.

    // 브라우저 언어가 한국어('ko')로 시작하면 한국어, 그 외에는 영어로 설정
    const isKorean = navigator.language.startsWith('ko');

    const TEXT_SUMMARY = isKorean 
        ? "▶ 펼치기" 
        : "▶ Click to expand";

    const BTN_CLASS = 'mes-collapse-btn';
    const SUMMARY_CLASS = 'mes-collapse-summary';
    const STORAGE_PREFIX = 'st_mesCollapse_';

    function getChatKey() {
        try {
            const ctx = window.SillyTavern?.getContext?.();
            return String(ctx?.chatId ?? ctx?.characterId ?? ctx?.name2 ?? 'default');
        } catch (e) {
            return 'default';
        }
    }

    function getMesId($mes) {
        const v = $mes.attr('mesid') ?? $mes.attr('data-mesid') ?? $mes.data('mesid');
        return v === undefined || v === null ? null : String(v);
    }

    function storageKey(mesId) {
        return STORAGE_PREFIX + getChatKey() + '_' + mesId;
    }

    function syncSummaryStyle($mes) {
        const $text = $mes.find('.mes_text').first();
        const $summary = $mes.find('.' + SUMMARY_CLASS).first();
        if (!$text.length || !$summary.length) return;

        // 호출될 때마다 "현재" 테마 기준으로 다시 읽어옴 (한 번 박아두고 끝내지 않음)
        const cs = window.getComputedStyle($text[0]);
        $summary.css({
            padding: cs.padding,
            margin: cs.margin,
            fontFamily: cs.fontFamily,
            fontSize: cs.fontSize,
            lineHeight: cs.lineHeight,
            color: cs.color,
        });
    }

    function refreshAllVisibleSummaries() {
        $('#chat .mes').each(function () {
            const $mes = $(this);
            const $summary = $mes.find('.' + SUMMARY_CLASS).first();
            if ($summary.length && $summary.is(':visible')) {
                syncSummaryStyle($mes);
            }
        });
    }

    function setCollapsed($mes, collapsed) {
        const $text = $mes.find('.mes_text').first();
        const $summary = $mes.find('.' + SUMMARY_CLASS).first();
        const $btn = $mes.find('.' + BTN_CLASS).first();

        if (collapsed) {
            syncSummaryStyle($mes); // 보여주기 직전에 최신 테마 스타일로 갱신
            $text.hide();
            $summary.show();
            $btn.removeClass('fa-compress').addClass('fa-expand').attr('title', '펼치기');
        } else {
            $text.show();
            $summary.hide();
            $btn.removeClass('fa-expand').addClass('fa-compress').attr('title', '접기');
        }
    }

    function toggleCollapse($mes) {
        const $text = $mes.find('.mes_text').first();
        if (!$text.length) return;

        const willCollapse = $text.is(':visible');
        setCollapsed($mes, willCollapse);

        const mesId = getMesId($mes);
        if (mesId !== null) {
            try {
                localStorage.setItem(storageKey(mesId), willCollapse ? 'true' : 'false');
            } catch (e) {
                /* localStorage 사용 불가 시 무시 (상태 저장만 안 될 뿐 기능엔 영향 없음) */
            }
        }
    }

    function ensureUi($mes) {
        if ($mes.find('.' + BTN_CLASS).length) return;

        const $btnHost = $mes.find('.extraMesButtons').first().length
            ? $mes.find('.extraMesButtons').first()
            : $mes.find('.mes_buttons').first();

        if (!$btnHost.length) return;

        const $btn = $(
            `<div class="mes_button ${BTN_CLASS} fa-solid fa-compress interactable" title="접기" tabindex="0"></div>`
        );
        $btnHost.prepend($btn);

        const $text = $mes.find('.mes_text').first();
        if ($text.length && !$mes.find('.' + SUMMARY_CLASS).length) {
            const $summary = $(
                `<div class="${SUMMARY_CLASS}">▶ Click to expand"</div>`
            );
            $summary.hide();
            $text.after($summary);
            syncSummaryStyle($mes);
        }

        const mesId = getMesId($mes);
        if (mesId !== null) {
            let saved = null;
            try {
                saved = localStorage.getItem(storageKey(mesId));
            } catch (e) {
                /* ignore */
            }
            if (saved === 'true') {
                setCollapsed($mes, true);
            }
        }
    }

    function scan() {
        $('#chat .mes').each(function () {
            ensureUi($(this));
        });
    }

    $(document).on('click', '.' + BTN_CLASS, function (e) {
        e.preventDefault();
        e.stopPropagation();
        toggleCollapse($(this).closest('.mes'));
    });

    $(document).on('click', '.' + SUMMARY_CLASS, function (e) {
        e.preventDefault();
        e.stopPropagation();
        toggleCollapse($(this).closest('.mes'));
    });

    function bindToEventSource() {
        // getContext() 안에 eventSource/event_types가 들어있음 (window.SillyTavern 바로 아래 X)
        try {
            const ctx = window.SillyTavern?.getContext?.();
            const eventSource = ctx?.eventSource;
            const event_types = ctx?.event_types;
            if (!eventSource || !event_types) return false;

            const onRendered = (mesId) => {
                const $mes = $(`#chat .mes[mesid="${mesId}"]`);
                if ($mes.length) ensureUi($mes);
            };

            if (event_types.CHARACTER_MESSAGE_RENDERED) {
                eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, onRendered);
            }
            if (event_types.USER_MESSAGE_RENDERED) {
                eventSource.on(event_types.USER_MESSAGE_RENDERED, onRendered);
            }
            return true;
        } catch (e) {
            return false; // 이벤트 API 사용 불가 -> 아래 MutationObserver가 대신 처리
        }
    }

    function init() {
        // 확장 로드 시점에 이미 화면에 떠 있는 메시지들 1회 전체 스캔
        scan();

        // 가능하면 ST 공식 이벤트로 정확한 타이밍에 훅 (실패해도 무방, 아래 observer가 백업)
        bindToEventSource();

        // 새로 추가된 노드만 골라서 처리 (전체 재스캔 X) - 이벤트 API 유무와 무관하게 항상 동작하는 안전망
        const chatEl = document.getElementById('chat');
        if (chatEl) {
            const observer = new MutationObserver((mutations) => {
                for (const mutation of mutations) {
                    mutation.addedNodes.forEach((node) => {
                        if (node.nodeType !== 1) return; // 텍스트 노드 등은 무시

                        const $node = $(node);
                        if ($node.hasClass('mes')) {
                            ensureUi($node);
                        } else {
                            // 혹시 .mes가 래퍼 노드 안에 중첩되어 추가되는 경우 대비
                            $node.find('.mes').each(function () {
                                ensureUi($(this));
                            });
                        }
                    });
                }
            });
            observer.observe(chatEl, { childList: true, subtree: false });
        }

        // 테마 전환 감지: <head> 안의 <style>/<link> 변경 시에만 반응 (폴링 아님)
        // 토글 없이 테마만 바꿔도 현재 펼쳐진 요약바들이 즉시 새 테마 여백/폰트로 갱신됨
        const headObserver = new MutationObserver(() => refreshAllVisibleSummaries());
        headObserver.observe(document.head, { childList: true, subtree: true, characterData: true });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
