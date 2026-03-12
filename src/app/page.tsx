'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

type AllocationType = 'unassigned' | 'mon-wed' | 'tue-thu' | 'early' | 'discharge' | 'deleted';

type TreatmentStatus = 'none' | 'done' | 'missed';

interface Patient {
  id: string;
  name: string;
  regNumber: string;
  allocation: AllocationType;
  createdAt: Date;
  dischargedAt?: Date;
  memo?: string;
  treatmentDailyStatus?: TreatmentStatus;
  treatmentUpdatedAt?: Date;
  diagnosis?: string;
  missedReason?: string;
  dischargeMemo?: string;
  infectionStatus?: 'none' | 'contact' | 'respiratory' | 'blood';
}

const getEffectiveTreatmentStatus = (p: Patient): TreatmentStatus => {
  if (!p.treatmentDailyStatus || p.treatmentDailyStatus === 'none') return 'none';
  if (!p.treatmentUpdatedAt) return 'none';

  const now = new Date();
  const cutoff = new Date(now);
  cutoff.setHours(8, 0, 0, 0);
  if (now.getHours() < 8) cutoff.setDate(cutoff.getDate() - 1);

  if (p.treatmentUpdatedAt < cutoff) return 'none';
  return p.treatmentDailyStatus;
};

const parseSafeDate = (dateStr: string | null | undefined): Date | undefined => {
  if (!dateStr) return undefined;
  const d = new Date(dateStr);
  if (!isNaN(d.getTime())) return d;
  const fallback = new Date(dateStr.replace(' ', 'T'));
  return !isNaN(fallback.getTime()) ? fallback : undefined;
};

export default function Home() {
  const [isRegistrationModalOpen, setIsRegistrationModalOpen] = useState(false);
  const [isPushEnabled, setIsPushEnabled] = useState(false);
  const [patients, setPatients] = useState<Patient[]>([]);

  // Form State
  const [newName, setNewName] = useState('');
  const [newRegNum, setNewRegNum] = useState('');

  // Push subscription check
  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then(reg => {
        reg.pushManager.getSubscription().then(sub => {
          setIsPushEnabled(!!sub);
        });
      });
    }
  }, []);

  // Edit State
  const [editingPatientId, setEditingPatientId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editRegNum, setEditRegNum] = useState('');
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);

  const startEditing = (patient: Patient) => {
    setEditingPatientId(patient.id);
    setEditName(patient.name);
    setEditRegNum(patient.regNumber);
  };

  const saveEdit = async (patientId: string) => {
    const finalName = editName.trim();
    const finalRegNum = editRegNum.trim();

    // Optimistic update
    const patientToUpdate = patients.find(p => p.id === patientId);
    if (!patientToUpdate) return;

    const newName = finalName || patientToUpdate.name;
    const newRegNum = finalRegNum || patientToUpdate.regNumber;

    setPatients(patients.map(p => {
      if (p.id !== patientId) return p;
      return { ...p, name: newName, regNumber: newRegNum };
    }));
    setEditingPatientId(null);

    // DB Update
    await supabase.from('patients').update({
      name: newName,
      reg_number: newRegNum
    }).eq('id', patientId);
  };

  const deletePatient = async (patientId: string) => {
    if (confirm('이 환자 기록을 완전히 삭제하시겠습니까?')) {
      setPatients(patients.filter(p => p.id !== patientId));
      await supabase.from('patients').delete().eq('id', patientId);
    }
  };

  const handleMemoBlur = async (patientId: string, memo: string) => {
    await supabase.from('patients').update({ memo }).eq('id', patientId);
  };

  // Realtime Subscription
  useEffect(() => {
    const fetchPatients = async () => {
      const { data } = await supabase
        .from('patients')
        .select('*')
        .order('created_at', { ascending: false });

      if (data) {
        setPatients(data.map(p => ({
          id: p.id,
          name: p.name,
          regNumber: p.reg_number,
          allocation: p.allocation as AllocationType,
          createdAt: parseSafeDate(p.created_at) || new Date(),
          dischargedAt: parseSafeDate(p.discharged_at),
          memo: p.memo || undefined,
          dischargeMemo: p.discharge_memo || undefined,
          diagnosis: p.diagnosis || undefined,
          missedReason: p.missed_reason || undefined,
          infectionStatus: (p.infection_status as ('none' | 'contact' | 'respiratory' | 'blood')) || 'none',
          treatmentDailyStatus: p.treatment_daily_status as TreatmentStatus,
          treatmentUpdatedAt: parseSafeDate(p.treatment_updated_at),
        })));
      }
    };

    fetchPatients();

    const channel = supabase
      .channel('public:patients')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'patients' }, (payload) => {
        if (payload.eventType === 'INSERT') {
          const p = payload.new;
          setPatients(prev => {
            if (prev.find(existing => existing.id === p.id)) return prev;



            return [{
              id: p.id,
              name: p.name,
              regNumber: p.reg_number,
              allocation: p.allocation,
              createdAt: parseSafeDate(p.created_at) || new Date(),
              dischargedAt: parseSafeDate(p.discharged_at),
              memo: p.memo || undefined,
              dischargeMemo: p.discharge_memo || undefined,
              diagnosis: p.diagnosis || undefined,
              missedReason: p.missed_reason || undefined,
              infectionStatus: p.infection_status || 'none',
              treatmentDailyStatus: p.treatment_daily_status,
              treatmentUpdatedAt: parseSafeDate(p.treatment_updated_at),
            }, ...prev];
          });
        }
        else if (payload.eventType === 'UPDATE') {
          const p = payload.new;
          setPatients(prev => prev.map(existing => {
            if (existing.id === p.id) {
              return {
                id: p.id,
                name: p.name,
                regNumber: p.reg_number,
                allocation: p.allocation,
                createdAt: parseSafeDate(p.created_at) || existing.createdAt,
                dischargedAt: parseSafeDate(p.discharged_at),
                memo: p.memo || undefined,
                dischargeMemo: p.discharge_memo || undefined,
                diagnosis: p.diagnosis || undefined,
                missedReason: p.missed_reason || undefined,
                infectionStatus: p.infection_status || 'none',
                treatmentDailyStatus: p.treatment_daily_status,
                treatmentUpdatedAt: parseSafeDate(p.treatment_updated_at),
              };
            }
            return existing;
          }));
        }
        else if (payload.eventType === 'DELETE') {
          setPatients(prev => prev.filter(existing => existing.id !== payload.old.id));
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Time-based background rules (Discharge auto-delete & Treatment Reset)
  useEffect(() => {
    const applyRules = async () => {
      const now = new Date();

      // 1. Check Discharged
      for (const p of patients) {
        if (p.allocation === 'discharge' && p.dischargedAt) {
          const diffHours = (now.getTime() - p.dischargedAt.getTime()) / (1000 * 3600);
          if (diffHours >= 40) {
            await supabase.from('patients').update({ allocation: 'deleted' }).eq('id', p.id);
          }
        }
      }

      // 2. Check Auto Reset
      const cutoff = new Date(now);
      cutoff.setHours(8, 0, 0, 0);
      if (now.getHours() < 8) cutoff.setDate(cutoff.getDate() - 1);

      for (const p of patients) {
        if (p.treatmentDailyStatus && p.treatmentDailyStatus !== 'none') {
          if (!p.treatmentUpdatedAt || p.treatmentUpdatedAt < cutoff) {
            await supabase.from('patients').update({
              treatment_daily_status: 'none',
              treatment_updated_at: now.toISOString()
            }).eq('id', p.id);
          }
        }
      }
    };

    const interval = setInterval(applyRules, 1000 * 60); // Check every minute
    return () => clearInterval(interval);
  }, [patients]);

  const handleEnablePush = async () => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window) {
      try {
        const registration = await navigator.serviceWorker.ready;
        let subscription = await registration.pushManager.getSubscription();

        if (isPushEnabled && subscription) {
          const success = await subscription.unsubscribe();
          if (success) {
            setIsPushEnabled(false);
            alert('알림이 해제되었습니다.');
          }
        } else {
          const permission = await Notification.requestPermission();
          if (permission === 'granted') {
            const publicVapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
            if (!publicVapidKey) {
              alert('Push 알림 VAPID 키가 설정되지 않았습니다.');
              return;
            }

            const base64UrlToUint8Array = (base64UrlData: string) => {
              const padding = '='.repeat((4 - base64UrlData.length % 4) % 4);
              const base64 = (base64UrlData + padding).replace(/\-/g, '+').replace(/_/g, '/');
              const rawData = window.atob(base64);
              const outputArray = new Uint8Array(rawData.length);
              for (let i = 0; i < rawData.length; ++i) {
                outputArray[i] = rawData.charCodeAt(i);
              }
              return outputArray;
            };

            subscription = await registration.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: base64UrlToUint8Array(publicVapidKey)
            });

            await fetch('/api/subscribe', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(subscription)
            });
            setIsPushEnabled(true);
            alert('알림 설정이 완료되었습니다.');
          } else {
            alert('알림 권한이 거부되었습니다.');
          }
        }
      } catch (error) {
        console.error('Push error:', error);
        alert('알림 설정 중 오류가 발생했습니다.');
      }
    } else {
      alert('현재 브라우저는 Push 알림을 지원하지 않습니다.');
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newRegNum.trim()) return;

    const newId = Date.now().toString();
    const newPatient: Patient = {
      id: newId,
      name: newName.trim(),
      regNumber: newRegNum.trim(),
      allocation: 'unassigned',
      createdAt: new Date(),
    };

    setPatients([newPatient, ...patients]);
    setNewName('');
    setNewRegNum('');
    setIsRegistrationModalOpen(false);

    await supabase.from('patients').insert([{
      id: newId,
      name: newPatient.name,
      reg_number: newPatient.regNumber,
      allocation: newPatient.allocation,
      created_at: newPatient.createdAt.toISOString()
    }]);

    await fetch('/api/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: `${newPatient.name}님이 등록되었습니다.` })
    }).catch(console.error);
  };

  const handleAllocationChange = async (patientId: string, newAllocation: AllocationType) => {
    const p = patients.find(x => x.id === patientId);
    if (!p) return;

    const isNewDischarge = newAllocation === 'discharge' && p.allocation !== 'discharge';
    const dischargedAt = isNewDischarge ? new Date() : p.dischargedAt;

    setPatients(patients.map(x => {
      if (x.id !== patientId) return x;
      return {
        ...x,
        allocation: newAllocation,
        dischargedAt,
        ...(isNewDischarge ? { dischargeMemo: '' } : {})
      };
    }));

    const updateData: Record<string, unknown> = {
      allocation: newAllocation,
      discharged_at: dischargedAt ? dischargedAt.toISOString() : null
    };

    if (isNewDischarge) {
      updateData.discharge_memo = '';
    }

    await supabase.from('patients').update(updateData).eq('id', patientId);
  };

  const toggleTreatmentStatus = async (patientId: string) => {
    const p = patients.find(x => x.id === patientId);
    if (!p) return;

    const currentEffectiveStatus = getEffectiveTreatmentStatus(p);
    let nextStatus: TreatmentStatus = 'none';
    if (currentEffectiveStatus === 'none') nextStatus = 'done';
    else if (currentEffectiveStatus === 'done') nextStatus = 'missed';
    else nextStatus = 'none';

    const now = new Date();

    setPatients(patients.map(x => {
      if (x.id !== patientId) return x;
      return { ...x, treatmentDailyStatus: nextStatus, treatmentUpdatedAt: now };
    }));

    await supabase.from('patients').update({
      treatment_daily_status: nextStatus,
      treatment_updated_at: now.toISOString()
    }).eq('id', patientId);
  };

  const toggleInfectionStatus = async (patientId: string) => {
    const p = patients.find(x => x.id === patientId);
    if (!p) return;

    let nextStatus: 'none' | 'contact' | 'respiratory' | 'blood' = 'none';
    if (!p.infectionStatus || p.infectionStatus === 'none') nextStatus = 'contact';
    else if (p.infectionStatus === 'contact') nextStatus = 'respiratory';
    else if (p.infectionStatus === 'respiratory') nextStatus = 'blood';
    else nextStatus = 'none';

    setPatients(patients.map(x => {
      if (x.id !== patientId) return x;
      return { ...x, infectionStatus: nextStatus };
    }));

    await supabase.from('patients').update({
      infection_status: nextStatus
    }).eq('id', patientId);
  };

  const sortPatientsByMemo = (list: Patient[]) => {
    return [...list].sort((a, b) => {
      const memoA = (a.memo || '').trim();
      const memoB = (b.memo || '').trim();
      if (!memoA && !memoB) return 0;
      if (!memoA) return 1;
      if (!memoB) return -1;

      const partsA = memoA.split('.');
      const partsB = memoB.split('.');

      const maxLen = Math.max(partsA.length, partsB.length);
      for (let i = 0; i < maxLen; i++) {
        const pA = partsA[i] || '';
        const pB = partsB[i] || '';
        if (pA !== pB) {
          return pA.localeCompare(pB, undefined, { numeric: true, sensitivity: 'base' });
        }
      }
      return 0;
    });
  };

  const waitingPatients = patients.filter(p => p.allocation === 'unassigned');
  const assignedPatients = {
    'mon-wed': sortPatientsByMemo(patients.filter(p => p.allocation === 'mon-wed')),
    'tue-thu': sortPatientsByMemo(patients.filter(p => p.allocation === 'tue-thu')),
    'early': sortPatientsByMemo(patients.filter(p => p.allocation === 'early')),
  };
  const dischargedPatients = patients.filter(p => p.allocation === 'discharge');
  const deletedPatients = patients.filter(p => p.allocation === 'deleted');

  const renderAssignedList = (title: string, list: Patient[], bgClass: string, textClass: string) => (
    <div className={`rounded-xl shadow-sm border p-4 flex flex-col gap-4 ${bgClass}`}>
      <div className="flex justify-between items-center border-b pb-2">
        <h3 className={`font-semibold ${textClass}`}>{title} 명단</h3>
        <span className="text-sm font-medium">{list.length}명</span>
      </div>
      {list.length === 0 ? (
        <p className="text-sm text-center py-4 text-gray-400">배정된 환자가 없습니다.</p>
      ) : (
        <ul className="space-y-2">
          {list.map(p => (
            <li key={p.id} className="bg-white rounded p-3 shadow-sm border border-gray-100 flex flex-col gap-2 text-sm">
              <div className="flex flex-row items-center gap-1.5">
                <button
                  onClick={() => toggleTreatmentStatus(p.id)}
                  title="치료 상태 변경 (클릭시: 시행 ⭢ 미시행 ⭢ 대기)"
                  className={`w-6 h-6 flex-shrink-0 flex items-center justify-center rounded border transition-colors ${getEffectiveTreatmentStatus(p) === 'none' ? 'border-gray-300 bg-white hover:bg-gray-100 shadow-sm' :
                    getEffectiveTreatmentStatus(p) === 'done' ? 'border-green-500 bg-green-50 text-green-600 shadow-sm' :
                      'border-red-500 bg-red-50 text-red-600 shadow-sm'
                    }`}
                >
                  {getEffectiveTreatmentStatus(p) === 'done' && <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>}
                  {getEffectiveTreatmentStatus(p) === 'missed' && <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12"></path></svg>}
                </button>

                <div className="flex-shrink-0" style={{ width: '60px' }}>
                  {openDropdownId === p.id ? (
                    <select
                      autoFocus
                      value={p.allocation}
                      onBlur={() => setOpenDropdownId(null)}
                      onChange={(e) => {
                        handleAllocationChange(p.id, e.target.value as AllocationType);
                        setOpenDropdownId(null);
                      }}
                      className="font-bold text-gray-800 bg-white border border-blue-400 rounded px-1.5 py-1 text-xs outline-none focus:ring-1 focus:ring-blue-500 shadow-sm w-full"
                    >
                      <option value="mon-wed">월/수 배정</option>
                      <option value="tue-thu">화/목 배정</option>
                      <option value="early">조기 (집중)</option>
                      <option value="unassigned">대기 목록</option>
                      <option value="discharge">d/c</option>
                    </select>
                  ) : (
                    <button onClick={() => setOpenDropdownId(p.id)} className="font-bold text-gray-800 hover:text-blue-600 transition-colors text-sm cursor-pointer text-left focus:outline-none underline decoration-gray-300 hover:decoration-blue-400 underline-offset-4 w-full truncate">
                      {p.name}
                    </button>
                  )}
                </div>

                <button
                  onClick={() => toggleInfectionStatus(p.id)}
                  className={`w-7 h-7 rounded-lg border-2 text-[15px] font-medium transition-all shadow-sm flex-shrink-0 flex items-center justify-center ${p.infectionStatus === 'contact'
                    ? 'bg-orange-50 border-orange-200 ring-2 ring-orange-100'
                    : p.infectionStatus === 'respiratory'
                      ? 'bg-purple-50 border-purple-200 ring-2 ring-purple-100'
                      : p.infectionStatus === 'blood'
                        ? 'bg-red-50 border-red-200 ring-2 ring-red-100'
                        : 'bg-gray-100 text-gray-400 border-gray-300 hover:bg-gray-200 hover:border-gray-400 font-bold'
                    }`}
                  title="감염 상태 (클릭: 접촉전파감염 ⭢ 공기전파감염 ⭢ 혈액전파감염 ⭢ 초기화)"
                >
                  {p.infectionStatus === 'contact' ? '🧤' : p.infectionStatus === 'respiratory' ? '😷' : p.infectionStatus === 'blood' ? '🩸' : '−'}
                </button>

                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="병동.호실"
                  title="우선순위 정렬 기준입니다. 숫자 및 문자(NCU 등) 입력 가능"
                  style={{ width: '85px', minWidth: '85px' }}
                  className="text-xs px-2 py-1.5 border border-gray-200 hover:border-gray-300 focus:border-blue-500 rounded outline-none bg-white transition-all text-gray-800 font-mono shadow-sm focus:ring-1 focus:ring-blue-500 flex-shrink-0"
                  value={p.memo || ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    setPatients(patients.map(patient => patient.id === p.id ? { ...patient, memo: val } : patient));
                  }}
                  onBlur={(e) => handleMemoBlur(p.id, e.target.value)}
                />

                <input
                  type="text"
                  placeholder="진단명"
                  title="진단명 입력"
                  className="flex-1 min-w-0 text-xs px-2 py-1.5 border border-gray-200 hover:border-gray-300 focus:border-blue-500 rounded outline-none bg-white transition-all text-gray-800 shadow-sm focus:ring-1 focus:ring-blue-500"
                  value={p.diagnosis || ''}
                  onChange={(e) => {
                    setPatients(patients.map(patient => patient.id === p.id ? { ...patient, diagnosis: e.target.value } : patient));
                  }}
                  onBlur={async (e) => {
                    await supabase.from('patients').update({ diagnosis: e.target.value }).eq('id', p.id);
                  }}
                />
              </div>

              {getEffectiveTreatmentStatus(p) === 'missed' && (
                <div className="mt-1 pl-9">
                  <input
                    type="text"
                    autoFocus
                    placeholder="미시행 사유 입력 (예: 환자 거부, 부재중)"
                    className="w-full text-xs px-2 py-1.5 border border-red-200 focus:border-red-500 rounded outline-none bg-red-50/50 transition-all text-red-700 placeholder-red-300"
                    value={p.missedReason || ''}
                    onChange={(e) => {
                      setPatients(patients.map(patient => patient.id === p.id ? { ...patient, missedReason: e.target.value } : patient));
                    }}
                    onBlur={async (e) => {
                      await supabase.from('patients').update({ missed_reason: e.target.value }).eq('id', p.id);
                    }}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans break-words">
      <div className="sticky top-0 z-20 flex flex-col shadow-sm">
        <header className="bg-white border-b border-gray-200 px-4 md:px-6 py-3 md:py-4 flex items-center justify-between">
          <div className="flex items-center gap-2 md:gap-3">
            <div className="w-7 h-7 md:w-8 md:h-8 bg-blue-600 text-white flex items-center justify-center rounded-lg font-bold text-base md:text-lg">
              +
            </div>
            <h1 className="text-base md:text-xl font-bold tracking-tight text-gray-800 truncate max-w-[150px] sm:max-w-none">신규 환자 관리 시스템</h1>
          </div>
          <div className="flex gap-2 md:gap-3">
            <button
              onClick={handleEnablePush}
              className={`px-3 py-1.5 md:px-4 md:py-2 rounded-lg text-xs md:text-sm font-medium transition-colors border ${isPushEnabled ? 'bg-green-500 hover:bg-green-600 text-white border-green-600 shadow-inner' : 'text-blue-600 bg-blue-50 hover:bg-blue-100 border-blue-200 shadow-sm'}`}
            >
              {isPushEnabled ? '알림 켜짐' : '알림 켜기'}
            </button>
            <button
              onClick={() => setIsRegistrationModalOpen(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 md:px-5 md:py-2 rounded-lg text-xs md:text-sm font-medium transition-colors shadow-sm flex items-center gap-1 md:gap-2 whitespace-nowrap"
            >
              <span>+</span> 환자 등록
            </button>
          </div>
        </header>

        {/* Total Status Summary */}
        <div className="bg-gray-50/95 backdrop-blur-sm border-b border-gray-200 px-4 md:px-6 py-2 md:py-3 shadow-inner">
          <div className="flex items-center justify-between text-xs md:text-sm max-w-7xl mx-auto w-full">
            <div className="flex items-center gap-3 md:gap-6 font-medium text-gray-600 overflow-x-auto whitespace-nowrap scrollbar-hide">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500"></span>월/수 {assignedPatients['mon-wed'].length}명</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-indigo-500"></span>화/목 {assignedPatients['tue-thu'].length}명</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500"></span>조기 {assignedPatients['early'].length}명</span>
            </div>
            <div className="font-bold text-gray-900 bg-white px-3 py-1 rounded-md border border-gray-200 shadow-sm flex-shrink-0 ml-3">
              총 배정 {assignedPatients['mon-wed'].length + assignedPatients['tue-thu'].length + assignedPatients['early'].length}명
            </div>
          </div>
        </div>
      </div>

      <main className="w-full max-w-7xl mx-auto px-4 md:px-6 py-4 md:py-8">
        {/* Assigned Patients View */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {renderAssignedList('월/수 배정', assignedPatients['mon-wed'], 'bg-blue-50/50 border-blue-100', 'text-blue-700')}
          {renderAssignedList('화/목 배정', assignedPatients['tue-thu'], 'bg-indigo-50/50 border-indigo-100', 'text-indigo-700')}
          {renderAssignedList('조기 (집중)', assignedPatients['early'], 'bg-amber-50/50 border-amber-100', 'text-amber-700')}
        </div>

        {/* Waitlist View */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col mb-8">
          <div className="border-b border-gray-200 bg-gray-50/50 px-4 md:px-6 py-3 md:py-4 flex justify-between items-center">
            <h2 className="text-base md:text-lg font-semibold text-gray-800">대기 환자 목록</h2>
            <span className="bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-0.5 rounded-full">총 {waitingPatients.length}명</span>
          </div>

          <div className="flex-1 p-0">
            {waitingPatients.length === 0 ? (
              <div className="text-center py-16 text-gray-500">
                <svg className="w-12 h-12 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path>
                </svg>
                <p className="text-lg text-gray-800 font-medium mb-1">대기 중인 환자가 없습니다.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left whitespace-nowrap md:whitespace-normal">
                  <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-3 md:px-6 py-3 md:py-4 font-medium">등록 번호</th>
                      <th className="px-3 md:px-6 py-3 md:py-4 font-medium">환자 이름</th>
                      <th className="px-3 md:px-6 py-3 md:py-4 font-medium">배정 (Assign)</th>
                      <th className="px-3 md:px-6 py-3 md:py-4 font-medium">관리</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {waitingPatients.map((patient) => {
                      const isEditing = patient.id === editingPatientId;
                      return (
                        <tr key={patient.id} className="bg-white hover:bg-gray-50 transition-colors">
                          <td className="px-3 md:px-6 py-3 md:py-4 font-mono text-gray-600">
                            {isEditing ? (
                              <input
                                type="text"
                                value={editRegNum}
                                onChange={(e) => {
                                  const val = e.target.value.replace(/[^0-9]/g, '');
                                  if (val.length <= 8) setEditRegNum(val);
                                }}
                                className="w-24 md:w-full text-xs px-2 py-1.5 border border-blue-300 rounded outline-none"
                              />
                            ) : (patient.regNumber)}
                          </td>
                          <td className="px-3 md:px-6 py-3 md:py-4 font-medium text-gray-900">
                            {isEditing ? (
                              <input
                                type="text"
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                className="w-20 md:w-full text-xs px-2 py-1.5 border border-blue-300 rounded outline-none"
                              />
                            ) : (patient.name)}
                          </td>
                          <td className="px-3 md:px-6 py-3 md:py-4">
                            <select
                              value={patient.allocation}
                              onChange={(e) => handleAllocationChange(patient.id, e.target.value as AllocationType)}
                              className="bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100 text-xs font-medium px-2.5 py-1.5 rounded-lg border outline-none transition-colors cursor-pointer"
                            >
                              <option value="unassigned">대기 중</option>
                              <option value="mon-wed">월/수 배정</option>
                              <option value="tue-thu">화/목 배정</option>
                              <option value="early">조기 (집중)</option>
                              <option value="discharge">Discharge</option>
                            </select>
                          </td>
                          <td className="px-3 md:px-6 py-3 md:py-4 flex gap-2">
                            {isEditing ? (
                              <>
                                <button
                                  onClick={() => saveEdit(patient.id)}
                                  className="text-white bg-blue-500 hover:bg-blue-600 px-3 py-1.5 rounded text-xs transition-colors shrink-0"
                                >
                                  저장
                                </button>
                                <button
                                  onClick={() => setEditingPatientId(null)}
                                  className="text-gray-600 bg-gray-100 hover:bg-gray-200 px-3 py-1.5 border border-gray-200 rounded text-xs transition-colors shrink-0"
                                >
                                  취소
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  onClick={() => startEditing(patient)}
                                  className="text-gray-500 bg-gray-100 hover:bg-gray-200 border border-gray-200 px-3 py-1.5 rounded text-xs transition-colors shrink-0"
                                >
                                  수정
                                </button>
                                <button
                                  onClick={() => deletePatient(patient.id)}
                                  className="text-red-500 bg-red-50 hover:bg-red-100 border border-red-100 px-3 py-1.5 rounded text-xs transition-colors shrink-0"
                                >
                                  삭제
                                </button>
                              </>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Discharge View */}
        <div className="bg-red-50/30 rounded-xl shadow-sm border border-red-100 overflow-hidden flex flex-col">
          <div className="border-b border-red-100 bg-red-50/50 px-4 md:px-6 py-3 md:py-4 flex justify-between items-center">
            <h2 className="text-base md:text-lg font-semibold text-red-800">Discharge 명단</h2>
            <span className="bg-red-100 text-red-800 text-xs font-medium px-2.5 py-0.5 rounded-full">총 {dischargedPatients.length}명</span>
          </div>

          <div className="flex-1 p-0">
            {dischargedPatients.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <p className="text-sm">최근 (48시간 이내) Discharge 된 환자가 없습니다.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left whitespace-nowrap md:whitespace-normal">
                  <thead className="text-xs text-red-500 uppercase bg-red-50/50 border-b border-red-100">
                    <tr>
                      <th className="px-3 md:px-6 py-2 md:py-3 font-medium">등록 번호</th>
                      <th className="px-3 md:px-6 py-2 md:py-3 font-medium">환자 이름</th>
                      <th className="px-3 md:px-6 py-2 md:py-3 font-medium">배정 상태</th>
                      <th className="px-3 md:px-6 py-2 md:py-3 font-medium min-w-[150px] md:w-1/3">비고</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-red-50">
                    {dischargedPatients.map((patient) => (
                      <tr key={patient.id} className="bg-white hover:bg-gray-50 transition-colors">
                        <td className="px-3 md:px-6 py-2 md:py-3 font-mono text-gray-600">{patient.regNumber}</td>
                        <td className="px-3 md:px-6 py-2 md:py-3 font-medium text-gray-900">{patient.name}</td>
                        <td className="px-3 md:px-6 py-2 md:py-3 flex flex-col sm:flex-row sm:items-center gap-1">
                          <select
                            value={patient.allocation}
                            onChange={(e) => handleAllocationChange(patient.id, e.target.value as AllocationType)}
                            className="bg-red-50 text-red-700 border-red-200 hover:bg-red-100 text-xs font-medium px-2.5 py-1.5 rounded-lg border outline-none transition-colors cursor-pointer w-full sm:w-auto"
                          >
                            <option value="unassigned">대기 목록으로 복귀</option>
                            <option value="mon-wed">월/수 배정</option>
                            <option value="tue-thu">화/목 배정</option>
                            <option value="early">조기 (집중)</option>
                            <option value="discharge">d/c</option>
                          </select>
                          <span className="sm:ml-2 text-[10px] md:text-xs text-gray-400">
                            ({patient.dischargedAt && !isNaN(patient.dischargedAt.getTime()) ? patient.dischargedAt.toLocaleDateString() : ''})
                          </span>
                        </td>
                        <td className="px-3 md:px-6 py-2 md:py-3">
                          <input
                            type="text"
                            placeholder="입력..."
                            title="d/c 사유나 다른 메모를 입력하세요"
                            className="w-full text-xs px-2 py-1.5 border border-gray-300 hover:border-gray-400 focus:border-blue-500 rounded outline-none bg-white transition-all text-gray-800 shadow-sm focus:ring-1 focus:ring-blue-500"
                            value={patient.dischargeMemo ?? ''}
                            onChange={(e) => {
                              setPatients(patients.map(p => p.id === patient.id ? { ...p, dischargeMemo: e.target.value } : p));
                            }}
                            onBlur={async (e) => {
                              await supabase.from('patients').update({ discharge_memo: e.target.value }).eq('id', patient.id);
                            }}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Deleted (Archived) Patients View */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-300 overflow-hidden flex flex-col mt-8">
          <div className="border-b border-gray-200 bg-gray-100 px-4 md:px-6 py-3 md:py-4 flex justify-between items-center">
            <h2 className="text-base md:text-lg font-semibold text-gray-700">과거 D/C 기록 (보관됨)</h2>
            <span className="bg-gray-200 text-gray-800 text-xs font-medium px-2.5 py-0.5 rounded-full">총 {deletedPatients.length}명</span>
          </div>

          <div className="flex-1 p-0">
            {deletedPatients.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <p className="text-sm">과거 D/C된 환자 기록이 없습니다.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left whitespace-nowrap md:whitespace-normal">
                  <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-3 md:px-6 py-3 md:py-4 font-medium">등록 번호</th>
                      <th className="px-3 md:px-6 py-3 md:py-4 font-medium">환자 이름</th>
                      <th className="px-3 md:px-6 py-3 md:py-4 font-medium">등록일</th>
                      <th className="px-3 md:px-6 py-3 md:py-4 font-medium">d/c일</th>
                      <th className="px-3 md:px-6 py-3 md:py-4 font-medium min-w-[150px] md:w-1/3">비고</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {deletedPatients.map((patient) => (
                      <tr key={patient.id} className="bg-white hover:bg-gray-50 transition-colors">
                        <td className="px-3 md:px-6 py-3 md:py-4 font-mono text-gray-600">{patient.regNumber}</td>
                        <td className="px-3 md:px-6 py-3 md:py-4 font-medium text-gray-900">{patient.name}</td>
                        <td className="px-3 md:px-6 py-3 md:py-4 text-gray-600 text-xs">
                          {patient.createdAt.toLocaleDateString()}
                        </td>
                        <td className="px-3 md:px-6 py-3 md:py-4 text-gray-600 text-xs">
                          {patient.dischargedAt ? patient.dischargedAt.toLocaleDateString() : '-'}
                        </td>
                        <td className="px-3 md:px-6 py-3 md:py-4 text-gray-600 text-xs break-all">
                          {patient.dischargeMemo || '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Registration Modal */}
      {isRegistrationModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-200 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
              <h2 className="text-lg font-bold text-gray-800">신규 환자 등록</h2>
              <button
                onClick={() => setIsRegistrationModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
                type="button"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
              </button>
            </div>

            <form onSubmit={handleRegister}>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">환자 이름</label>
                  <input
                    autoFocus
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    required
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                    placeholder="홍길동"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">등록 번호 (숫자 8자리)</label>
                  <input
                    type="tel"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={newRegNum}
                    onChange={(e) => {
                      const val = e.target.value.replace(/[^0-9]/g, '');
                      if (val.length <= 8) {
                        setNewRegNum(val);
                      }
                    }}
                    required
                    minLength={8}
                    maxLength={8}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                    placeholder="예: 12345678"
                  />
                </div>
              </div>

              <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsRegistrationModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-50"
                >
                  등록 완료
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
