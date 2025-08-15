

class ErrorHandler extends Error{
    constructor(message,statusCode){
        super();
        this.statusCode = statusCode;
        this.message = message; 

    }
}


export {ErrorHandler}

