function Loader() {
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-white/75 backdrop-blur-sm">
      <div className="flex items-center gap-3 rounded-full border border-[#EFF2F6] bg-white px-5 py-3 shadow-sm">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-[#185FA5] border-r-transparent" />
        <span className="text-sm font-medium text-[#36506C]">Loading...</span>
      </div>
    </div>
  );
}

export default Loader;
