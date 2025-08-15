import {
    CalendarMonth as CalendarIcon,
    Face as FaceIcon,
    AlternateEmail as UsernameIcon,
} from "@mui/icons-material";
import { Avatar, Stack, Typography } from '@mui/material';
import axios from "axios";
import moment from "moment";
import React, { useEffect } from 'react';
import { useDispatch, useSelector } from "react-redux";
import { server } from "../../constants/config";
import { transformImage } from "../../lib/feature";


const Profile = () => {
    const { user } = useSelector((state) => state.auth);
    const dispatch = useDispatch();
    useEffect(() => {
        axios
            .get(`${server}/api/v1/user/me`, { withCredentials: true })
    }, [dispatch])


    return (
        <Stack spacing={"2rem"} direction={"column"} alignItems={"center"}>

            <Avatar
                src={transformImage(user?.avatar?.url)}
                alt="User Profile Picture"
                sx={{
                    width: 200,
                    height: 200,
                    objectFit: "cover",
                    marginBottom: "1rem",
                    border: "5px solid white",
                }}
            />
            <ProfileCard heading={"Bio"} text={user?.bio} />

            <ProfileCard
                heading={"Username"}
                text={user?.username}
                Icon={UsernameIcon}
            />

            <ProfileCard
                heading={"Name"}
                text={user?.name}
                Icon={FaceIcon}
            />

            <ProfileCard
                heading={"Joined"}
                text={moment(user?.createdAt).fromNow()}
                Icon={CalendarIcon}
            />
        </Stack>
    );
};

const ProfileCard = ({ text, Icon, heading }) => (
    <Stack
        direction={"row"}
        spacing={"1rem"}
        alignItems={"center"}
        color={"white"}
        textAlign={"center"}
    >
        {Icon && <Icon />}
        <Stack>
            <Typography variant='body1' fontWeight={500}>
                {text}
            </Typography>
            <Typography variant='caption' color={"gray"}>
                {heading}
            </Typography>
        </Stack>
    </Stack>
);

export default Profile;
