import mongoose, { Schema, model } from "mongoose";
import { hash } from "bcrypt";

const schema = new Schema({
   name: {
      type: String,
      required: true,
   },
   bio: {
      type: String,
   },
   username: {
      type: String,
      // unique: true,
      required: true,
   },
   password: {
      type: String,
      select: false, 
      required: true,
   },
   avatar: {
      public_id: {
         type: String,
         required: true,
      },
      url: {
         type: String,
         required: true,
      },
   },
},
{
   timestamps: true
});


schema.index(
   { username: 1 },
   { unique: true, collation: { locale: "en", strength: 2 } }
);

// Text search on name & bio
schema.index({ name: "text", bio: "text" }, { weights: { name:5, bio: 1 } });

// Compound index for fast sorting by creation date & username
schema.index({ createdAt: -1, username: 1 });




// password hashing
 schema.pre("save", async function (next) {
   if (!this.isModified("password")) return next(); 
   this.password = await hash(this.password, 10);
   return next(); 
});


export const User = mongoose.models.User || model("User", schema);
