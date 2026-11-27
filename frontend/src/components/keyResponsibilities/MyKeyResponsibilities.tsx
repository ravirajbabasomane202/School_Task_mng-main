import { useQuery } from '@tanstack/react-query';
import { getMyKeyResponsibilities } from '../../services/keyResponsibilityService';

/**
 * Key Responsibilities of the signed-in user, shown directly under the
 * dashboard welcome message. The request carries no user id: the backend reads
 * it from the access token, so another user's list can never be displayed.
 */
function MyKeyResponsibilities() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['my-key-responsibilities'],
    queryFn: () => getMyKeyResponsibilities()
  });

  return (
    <section aria-label="Key Responsibilities" className="mt-4" data-testid="my-key-responsibilities">
      <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8A99B0]">Key Responsibilities</h2>
      {isLoading ? (
        <p className="mt-2 text-sm text-[#8A99B0]">Loading your key responsibilities…</p>
      ) : isError ? (
        <p className="mt-2 text-sm text-red-600">Unable to load your key responsibilities.</p>
      ) : !data?.items?.length ? (
        <p className="mt-2 text-sm text-[#8A99B0]">No key responsibilities have been assigned to you yet.</p>
      ) : (
        <>
          {data.summary ? <p className="mt-2 text-sm text-[#36506C]">{data.summary}</p> : null}
          <ol className="mt-2 grid gap-2 md:grid-cols-2">
            {data.items.map((item, index) => (
              <li
                className="flex gap-2 rounded-xl border border-[#EFF2F6] bg-white px-3 py-2 text-sm text-[#1E293B]"
                key={item.id}
              >
                <span className="font-semibold text-[#0C447C]">{index + 1}.</span>
                <span className="whitespace-pre-line">{item.description}</span>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}

export default MyKeyResponsibilities;
