function __TS__TryCatchFinally(try, catch, finally)
	local unpack = unpack or table.unpack
	local tryReturn = { pcall(try) }
	local catchReturn = not tryReturn[1]
	        and catch
	        and { pcall(catch, tryReturn[2]) }
	local finalReturn = finally and { finally() }
	if finalReturn and #finalReturn > 0 then return unpack(finalReturn) end
	if catchReturn then
	    if not table.remove(catchReturn, 1) then
	        error(catchReturn[1], 1)
	    elseif #catchReturn > 0 then
	        return unpack(catchReturn)
	    end
	end
	if table.remove(tryReturn, 1) and #tryReturn > 0 then
	    return unpack(tryReturn)
	end
end
