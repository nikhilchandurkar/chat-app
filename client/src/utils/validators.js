import { isValidUsername } from "6pp"


 const usernamevalidator = (username)=>{
    if (!isValidUsername(username)) {
        
        return {isValid : false , errorMessage :"usename is invalid"}
    }
}

export {usernamevalidator}