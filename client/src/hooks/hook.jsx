import { useEffect, useRef, useState } from "react"
import toast from "react-hot-toast";



const useErrors = (errors = []) => {
    useEffect(() => {
        errors.forEach(({ error, isError, fallback }) => {
            if (isError)
                if (fallback) fallback();
                else toast.error(error?.respose?.data?.message || "soemthing went wrong");
        })
    }, [errors])

}


const useAsyncMutation = (mutatationHook) => {
    const [isLoading, setIsLoading] = useState(false);
    const [data, setData] = useState(null);
  
    const [mutate] = mutatationHook();
  
    const executeMutation = async (toastMessage, ...args) => {
      setIsLoading(true);
      const toastId = toast.loading(toastMessage || "Updating data...");
  
      try {
        const res = await mutate(...args);
  
        if (res.data) {
          toast.success(res.data.message || "Updated data successfully", {
            id: toastId,
          });
          setData(res.data);
        } else {
          toast.error(res?.error?.data?.message || "Something went wrong", {
            id: toastId,
          });
        }
      } catch (error) {
        toast.error("Something went wrong", { id: toastId });
      } finally {
        setIsLoading(false);
      }
    };
  
    return [executeMutation, isLoading, data];
  };

  const useSocketEvents = (socket, handlers) => {
    const handlersRef = useRef(handlers);
    handlersRef.current = handlers;

    const eventKeys = Object.keys(handlers).join("|");

    useEffect(() => {
      if (!socket || typeof socket.on !== "function") return;

      const bound = {};
      Object.keys(handlersRef.current).forEach((event) => {
        bound[event] = (...args) => {
          const fn = handlersRef.current[event];
          if (typeof fn === "function") fn(...args);
        };
        socket.on(event, bound[event]);
      });

      return () => {
        if (!socket || typeof socket.off !== "function") return;
        Object.entries(bound).forEach(([event, wrapper]) => {
          socket.off(event, wrapper);
        });
      };
    }, [socket, eventKeys]);
  };
  

export { useErrors,useAsyncMutation,useSocketEvents } 