import Badge from '../common/Badge';
import { checkedOnText, dueDateText, timingLabel, type RegisterCheckInfo } from '../../utils/registerCheckUtils';

/**
 * "Due Date" and "Checked On" of a register period, so a yellow marker on the
 * 5th reads: Due 05 Oct 2026 / Checked On 08 Oct 2026, 10:42 am. Display only:
 * every value comes from the backend.
 */
function RegisterCheckInfoRows({ info }: { info: RegisterCheckInfo }) {
  const label = timingLabel(info);
  return (
    <dl className="mt-2 space-y-1 text-xs">
      <div className="flex justify-between gap-3">
        <dt className="text-[#8A99B0]">Due Date</dt>
        <dd className="font-medium text-[#1E293B]">{dueDateText(info)}</dd>
      </div>
      <div className="flex justify-between gap-3">
        <dt className="text-[#8A99B0]">Checked On</dt>
        <dd className="font-medium text-[#1E293B]">{checkedOnText(info)}</dd>
      </div>
      {label ? (
        <div className="flex justify-end">
          <Badge variant={info.check_timing === 'LATE' ? 'amber' : 'green'}>{label}</Badge>
        </div>
      ) : null}
    </dl>
  );
}

export default RegisterCheckInfoRows;
