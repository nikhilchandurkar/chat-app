const errorMiddleware = (err, req, res, next) => {
    try {
        // Default error properties
        err.message = err.message || "Internal Server Error";
        err.statusCode = err.statusCode || 500;

// Log the error for debugging

        // Handle MongoDB duplicate key errors
        if (err.code === 11000) {
            const fields = Object.keys(err.keyPattern);
            err.message = `Duplicate value for fields: ${fields.join(", ")}`;
            err.statusCode = 400;
        }

        // Handle Mongoose CastError
        if (err.name === "CastError") {
            const errorPath = err.path;
            err.message = `Invalid format for path: ${errorPath}`;
            err.statusCode = 400;
        }

        // Return error response
        return res.status(err.statusCode).json({
            success: false,
            message: err.message,
        });
    } catch (error) {
        // Fallback for unexpected middleware errors
        console.error("Unexpected Error in Middleware: ", error);
        return res.status(500).json({
            success: false,
            message: "Unexpected error occurred.",
        });
    }
};

const tryCatch = (passedFunction) => async (req, res, next) => {
    try {
        await passedFunction(req, res, next);
    } catch (error) {
        next(error); 
    }
};

export { errorMiddleware, tryCatch };
