import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  MessageCircle,
  PhoneOff,
  Users,
  X,
} from 'lucide-react';
import { buildWhatsAppUrl, formatWhatsAppDisplay, normalizeWhatsAppNumber } from '../lib/whatsapp';

export interface WhatsAppRecipientItem {
  id: string;
  athleteName: string;
  parentName?: string;
  parentPhone?: string;
  subtitle?: string;
  message: string;
}

interface WhatsAppNotifyModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  recipients: WhatsAppRecipientItem[];
  groupBroadcastMessage?: string;
  groupBroadcastLabel?: string;
}

export const WhatsAppNotifyModal: React.FC<WhatsAppNotifyModalProps> = ({
  open,
  onClose,
  title,
  description,
  recipients,
  groupBroadcastMessage,
  groupBroadcastLabel = 'Pesan Siaran Grup Orang Tua',
}) => {
  const [selectedId, setSelectedId] = useState<string>(recipients[0]?.id || '');
  const [editedMessages, setEditedMessages] = useState<Record<string, string>>({});
  const [editedGroupMsg, setEditedGroupMsg] = useState<string>(groupBroadcastMessage || '');
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSelectedId(recipients[0]?.id || '');
    setEditedMessages({});
    setEditedGroupMsg(groupBroadcastMessage || '');
    setSentIds(new Set());
    setCopiedKey(null);
  }, [open, recipients, groupBroadcastMessage]);

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  const activeRecipient = useMemo(
    () => recipients.find((r) => r.id === selectedId) || recipients[0] || null,
    [recipients, selectedId]
  );

  const reachableCount = useMemo(
    () => recipients.filter((r) => Boolean(normalizeWhatsAppNumber(r.parentPhone))).length,
    [recipients]
  );

  if (!open || typeof document === 'undefined') return null;

  const markSent = (id: string) => {
    setSentIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  };

  const copyText = (key: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const activeMessage = activeRecipient
    ? editedMessages[activeRecipient.id] ?? activeRecipient.message
    : '';
  const activeWaPhone = activeRecipient ? normalizeWhatsAppNumber(activeRecipient.parentPhone) : null;
  const activeWaUrl = activeRecipient ? buildWhatsAppUrl(activeRecipient.parentPhone, activeMessage) : '';

  const isMultiMode = recipients.length > 1 || Boolean(groupBroadcastMessage);

  return createPortal(
    <div
      className="fixed inset-0 z-[65] flex items-end sm:items-center justify-center p-0 sm:p-4 no-print"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="fixed inset-0 bg-slate-900/45 backdrop-blur-[1px]"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative z-10 bg-white border border-slate-200 rounded-t-2xl sm:rounded-xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden pb-safe">
        <div className="sm:hidden w-10 h-1 bg-slate-300 rounded-full mx-auto mt-3 shrink-0" />

        {/* Header */}
        <div className="px-4 sm:px-6 pt-3 sm:pt-5 pb-3.5 border-b border-slate-200 flex items-start justify-between gap-3 shrink-0">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center shrink-0 mt-0.5">
              <MessageCircle className="w-4 h-4 text-emerald-700" />
            </div>
            <div className="min-w-0">
              <h2 className="font-display text-base sm:text-lg font-semibold text-slate-900">
                {title}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">{description}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 rounded-lg min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer shrink-0"
            aria-label="Tutup panel WhatsApp"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {/* Group broadcast section (used primarily for schedule changes) */}
          {groupBroadcastMessage && (
            <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/70 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-900">
                  <Users className="w-4 h-4 text-sky-700 shrink-0" />
                  <span>{groupBroadcastLabel}</span>
                </div>
                <span className="text-[11px] text-slate-500">
                  Kirim langsung ke grup WA orang tua/atlet
                </span>
              </div>
              <textarea
                rows={5}
                value={editedGroupMsg}
                onChange={(e) => setEditedGroupMsg(e.target.value)}
                className="w-full px-3 py-2 text-xs leading-relaxed bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-sky-600"
              />
              <div className="flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => copyText('group', editedGroupMsg)}
                  className="inline-flex items-center gap-1.5 px-3.5 min-h-[40px] sm:min-h-[36px] text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
                >
                  {copiedKey === 'group' ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      Pesan Grup Tersalin
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      Salin Pesan Grup
                    </>
                  )}
                </button>
                <a
                  href={buildWhatsAppUrl(null, editedGroupMsg)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => markSent('__group__')}
                  className="inline-flex items-center gap-1.5 px-4 min-h-[40px] sm:min-h-[36px] text-xs font-medium text-white bg-emerald-700 rounded-lg hover:bg-emerald-800"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  Buka WhatsApp (Pilih Grup)
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          )}

          {/* Individual Parent Recipients */}
          {recipients.length > 0 && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-semibold text-slate-900">
                  {isMultiMode
                    ? `Kirim Langsung ke WhatsApp Orang Tua (${reachableCount}/${recipients.length} nomor valid)`
                    : 'Pratinjau Pesan WhatsApp Orang Tua'}
                </div>
                {sentIds.size > 0 && (
                  <span className="text-xs font-mono-tabular text-emerald-700 font-medium">
                    {Array.from(sentIds).filter((id) => id !== '__group__').length} dibuka di WA
                  </span>
                )}
              </div>

              {recipients.length > 1 && (
                <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-56 overflow-y-auto">
                  {recipients.map((rec) => {
                    const phoneNorm = normalizeWhatsAppNumber(rec.parentPhone);
                    const recMsg = editedMessages[rec.id] ?? rec.message;
                    const isSelected = activeRecipient?.id === rec.id;
                    const isSent = sentIds.has(rec.id);

                    return (
                      <div
                        key={rec.id}
                        className={`p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 transition-colors ${
                          isSelected ? 'bg-sky-50/70' : 'bg-white hover:bg-slate-50/70'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => setSelectedId(rec.id)}
                          className="text-left min-w-0 flex-1 cursor-pointer"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-slate-900 truncate">
                              {rec.athleteName}
                            </span>
                            {isSent && (
                              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700">
                                <CheckCircle2 className="w-3 h-3" />
                                Dibuka
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5 truncate">
                            Wali: {rec.parentName || 'Belum diisi'} ·{' '}
                            <span className="font-mono-tabular">
                              {phoneNorm ? formatWhatsAppDisplay(rec.parentPhone) : 'No. WA belum ada'}
                            </span>
                            {rec.subtitle ? ` · ${rec.subtitle}` : ''}
                          </div>
                        </button>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => copyText(rec.id, recMsg)}
                            className="px-2.5 min-h-[34px] text-[11px] font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
                          >
                            {copiedKey === rec.id ? 'Tersalin' : 'Salin'}
                          </button>
                          {phoneNorm ? (
                            <a
                              href={buildWhatsAppUrl(rec.parentPhone, recMsg)}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={() => markSent(rec.id)}
                              className="inline-flex items-center gap-1 px-3 min-h-[34px] text-[11px] font-medium text-white bg-emerald-700 rounded-lg hover:bg-emerald-800"
                            >
                              <MessageCircle className="w-3 h-3" />
                              Kirim WA
                            </a>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 min-h-[34px] text-[11px] text-slate-400 bg-slate-100 rounded-lg">
                              <PhoneOff className="w-3 h-3" />
                              Tanpa No.
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Active recipient message editor & action */}
              {activeRecipient && (
                <div className="border border-slate-200 rounded-xl p-4 space-y-3 bg-white">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs">
                    <div>
                      <span className="font-semibold text-slate-900">
                        {activeRecipient.parentName || 'Wali Atlet'}
                      </span>{' '}
                      <span className="text-slate-500">({activeRecipient.athleteName})</span>
                    </div>
                    <div className="font-mono-tabular text-slate-600">
                      {activeWaPhone
                        ? `WhatsApp: ${formatWhatsAppDisplay(activeRecipient.parentPhone)}`
                        : 'Nomor WhatsApp wali belum diisi (gunakan Salin atau pilih kontak manual)'}
                    </div>
                  </div>

                  <textarea
                    rows={7}
                    value={activeMessage}
                    onChange={(e) =>
                      setEditedMessages((prev) => ({
                        ...prev,
                        [activeRecipient.id]: e.target.value,
                      }))
                    }
                    className="w-full px-3 py-2 text-xs leading-relaxed border border-slate-200 rounded-lg focus:outline-none focus:border-sky-600"
                  />

                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => copyText(`editor-${activeRecipient.id}`, activeMessage)}
                      className="inline-flex items-center gap-1.5 px-3.5 min-h-[40px] sm:min-h-[36px] text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
                    >
                      {copiedKey === `editor-${activeRecipient.id}` ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                          Pesan Tersalin
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          Salin Pesan
                        </>
                      )}
                    </button>
                    <a
                      href={activeWaUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => markSent(activeRecipient.id)}
                      className="inline-flex items-center gap-1.5 px-4 min-h-[40px] sm:min-h-[36px] text-xs font-medium text-white bg-emerald-700 rounded-lg hover:bg-emerald-800"
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                      {activeWaPhone ? 'Kirim ke WhatsApp Orang Tua' : 'Buka WhatsApp & Pilih Kontak'}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              )}
            </div>
          )}

          {recipients.length === 0 && !groupBroadcastMessage && (
            <div className="p-8 text-center text-xs text-slate-500">
              Belum ada penerima yang cocok untuk notifikasi ini.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-6 py-3.5 border-t border-slate-200 bg-slate-50/70 flex items-center justify-between gap-3 shrink-0">
          <span className="text-[11px] text-slate-500">
            Pesan dibuka langsung melalui WhatsApp resmi tanpa biaya tambahan.
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 min-h-[40px] sm:min-h-[36px] text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-100 cursor-pointer shrink-0"
          >
            Selesai
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
