import React from 'react';
import { Check, CheckCheck, Clock, XCircle } from 'lucide-react';
import { MessageLog } from '../types';

export const DeliveryTick: React.FC<{ status: MessageLog['status']; showLabel?: boolean }> = ({
  status,
  showLabel = true,
}) => {
  if (status === 'read') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-sky-400 whitespace-nowrap">
        <CheckCheck className="w-4 h-4 text-sky-400" />
        {showLabel && 'Read'}
      </span>
    );
  }
  if (status === 'delivered') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-300 whitespace-nowrap">
        <CheckCheck className="w-4 h-4 text-slate-300" />
        {showLabel && 'Delivered'}
      </span>
    );
  }
  if (status === 'sent') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-400 whitespace-nowrap">
        <Check className="w-3.5 h-3.5 text-slate-400" />
        {showLabel && 'Sent'}
      </span>
    );
  }
  if (status === 'failed') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-rose-400 whitespace-nowrap">
        <XCircle className="w-3.5 h-3.5 text-rose-400" />
        {showLabel && 'Failed'}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 whitespace-nowrap">
      <Clock className="w-3.5 h-3.5 text-slate-500" />
      {showLabel && 'Queued'}
    </span>
  );
};
